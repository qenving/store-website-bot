import { EventEmitter } from 'events';
import { createLogger } from '../logging/logger';
import { metricsService } from '../monitoring/metricsService';

const logger = createLogger({ module: 'AutoScaler' });

export interface ScalingMetrics {
  cpu: number; // Percentage
  memory: number; // Percentage
  activeConnections: number;
  requestRate: number; // Requests per second
  queueDepth: number;
  responseTime: number; // Average response time in ms
}

export interface ScalingRule {
  metric: keyof ScalingMetrics;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  scaleUpIncrement: number;
  scaleDownIncrement: number;
  cooldownPeriod: number; // ms
}

export interface AutoScalerConfig {
  enabled: boolean;
  minInstances: number;
  maxInstances: number;
  checkInterval: number;
  rules: ScalingRule[];
  scalingCooldown: number; // Global cooldown between scaling operations
}

export interface ScalingDecision {
  timestamp: Date;
  action: 'scale-up' | 'scale-down' | 'no-action';
  currentInstances: number;
  targetInstances: number;
  reason: string;
  metrics: ScalingMetrics;
}

/**
 * Auto Scaler for dynamic resource allocation
 * Automatically scales services based on metrics
 */
export class AutoScaler extends EventEmitter {
  private config: AutoScalerConfig;
  private currentInstances: number;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastScalingAction: Date | null = null;
  private scalingHistory: ScalingDecision[] = [];
  private ruleCooldowns: Map<string, number> = new Map();

  constructor(config: AutoScalerConfig, initialInstances: number) {
    super();
    this.config = config;
    this.currentInstances = initialInstances;
  }

  /**
   * Start auto-scaling
   */
  start(): void {
    if (this.checkInterval) {
      logger.warn('Auto-scaler already running');
      return;
    }

    if (!this.config.enabled) {
      logger.warn('Auto-scaler is disabled');
      return;
    }

    this.checkInterval = setInterval(() => {
      this.evaluateScaling().catch(error => {
        logger.error('Auto-scaling evaluation error', error);
      });
    }, this.config.checkInterval);

    logger.info('Auto-scaler started', {
      minInstances: this.config.minInstances,
      maxInstances: this.config.maxInstances,
      checkInterval: this.config.checkInterval,
      currentInstances: this.currentInstances
    });
  }

  /**
   * Stop auto-scaling
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Auto-scaler stopped');
    }
  }

  /**
   * Evaluate whether scaling is needed
   */
  private async evaluateScaling(): Promise<void> {
    // Check global cooldown
    if (this.isInCooldown()) {
      logger.debug('Scaling in cooldown period, skipping evaluation');
      return;
    }

    // Collect current metrics
    const metrics = await this.collectMetrics();

    logger.debug('Auto-scaling evaluation', { metrics });

    // Evaluate each rule
    let scaleUpVotes = 0;
    let scaleDownVotes = 0;
    const reasons: string[] = [];

    for (const rule of this.config.rules) {
      const ruleKey = `${rule.metric}`;

      // Check rule-specific cooldown
      const lastRuleAction = this.ruleCooldowns.get(ruleKey) || 0;
      if (Date.now() - lastRuleAction < rule.cooldownPeriod) {
        continue;
      }

      const metricValue = metrics[rule.metric];

      if (metricValue >= rule.scaleUpThreshold) {
        scaleUpVotes++;
        reasons.push(`${rule.metric} at ${metricValue} >= ${rule.scaleUpThreshold}`);
        this.ruleCooldowns.set(ruleKey, Date.now());
      } else if (metricValue <= rule.scaleDownThreshold) {
        scaleDownVotes++;
        reasons.push(`${rule.metric} at ${metricValue} <= ${rule.scaleDownThreshold}`);
        this.ruleCooldowns.set(ruleKey, Date.now());
      }
    }

    // Make scaling decision
    let decision: ScalingDecision;

    if (scaleUpVotes > scaleDownVotes) {
      decision = await this.scaleUp(metrics, reasons.join(', '));
    } else if (scaleDownVotes > scaleUpVotes) {
      decision = await this.scaleDown(metrics, reasons.join(', '));
    } else {
      decision = {
        timestamp: new Date(),
        action: 'no-action',
        currentInstances: this.currentInstances,
        targetInstances: this.currentInstances,
        reason: 'No scaling action needed',
        metrics
      };
    }

    // Record decision
    this.recordScalingDecision(decision);

    // Emit event
    if (decision.action !== 'no-action') {
      this.emit('scalingDecision', decision);
    }
  }

  /**
   * Scale up instances
   */
  private async scaleUp(metrics: ScalingMetrics, reason: string): Promise<ScalingDecision> {
    const targetInstances = Math.min(
      this.currentInstances + this.calculateScaleUpIncrement(),
      this.config.maxInstances
    );

    if (targetInstances === this.currentInstances) {
      logger.info('Already at maximum instances', {
        current: this.currentInstances,
        max: this.config.maxInstances
      });

      return {
        timestamp: new Date(),
        action: 'no-action',
        currentInstances: this.currentInstances,
        targetInstances: this.currentInstances,
        reason: 'Already at maximum instances',
        metrics
      };
    }

    logger.info('Scaling up', {
      current: this.currentInstances,
      target: targetInstances,
      reason
    });

    const decision: ScalingDecision = {
      timestamp: new Date(),
      action: 'scale-up',
      currentInstances: this.currentInstances,
      targetInstances,
      reason,
      metrics
    };

    // Update state
    this.currentInstances = targetInstances;
    this.lastScalingAction = new Date();

    // Emit scaling event
    this.emit('scaleUp', {
      from: decision.currentInstances,
      to: targetInstances,
      reason
    });

    return decision;
  }

  /**
   * Scale down instances
   */
  private async scaleDown(metrics: ScalingMetrics, reason: string): Promise<ScalingDecision> {
    const targetInstances = Math.max(
      this.currentInstances - this.calculateScaleDownIncrement(),
      this.config.minInstances
    );

    if (targetInstances === this.currentInstances) {
      logger.info('Already at minimum instances', {
        current: this.currentInstances,
        min: this.config.minInstances
      });

      return {
        timestamp: new Date(),
        action: 'no-action',
        currentInstances: this.currentInstances,
        targetInstances: this.currentInstances,
        reason: 'Already at minimum instances',
        metrics
      };
    }

    logger.info('Scaling down', {
      current: this.currentInstances,
      target: targetInstances,
      reason
    });

    const decision: ScalingDecision = {
      timestamp: new Date(),
      action: 'scale-down',
      currentInstances: this.currentInstances,
      targetInstances,
      reason,
      metrics
    };

    // Update state
    this.currentInstances = targetInstances;
    this.lastScalingAction = new Date();

    // Emit scaling event
    this.emit('scaleDown', {
      from: decision.currentInstances,
      to: targetInstances,
      reason
    });

    return decision;
  }

  /**
   * Calculate scale-up increment based on rules
   */
  private calculateScaleUpIncrement(): number {
    const increments = this.config.rules.map(r => r.scaleUpIncrement);
    return Math.max(...increments);
  }

  /**
   * Calculate scale-down increment based on rules
   */
  private calculateScaleDownIncrement(): number {
    const increments = this.config.rules.map(r => r.scaleDownIncrement);
    return Math.min(...increments);
  }

  /**
   * Check if auto-scaler is in global cooldown
   */
  private isInCooldown(): boolean {
    if (!this.lastScalingAction) return false;

    const timeSinceLastAction = Date.now() - this.lastScalingAction.getTime();
    return timeSinceLastAction < this.config.scalingCooldown;
  }

  /**
   * Collect current metrics
   */
  private async collectMetrics(): Promise<ScalingMetrics> {
    try {
      const metricsData = await metricsService.getMetrics();

      // Extract relevant metrics
      const cpu = this.calculateCPUUsage();
      const memory = this.calculateMemoryUsage();
      const activeConnections = metricsData.transactions?.active || 0;
      const requestRate = this.calculateRequestRate();
      const queueDepth = metricsData.queues?.total_waiting || 0;
      const responseTime = this.calculateAverageResponseTime();

      return {
        cpu,
        memory,
        activeConnections,
        requestRate,
        queueDepth,
        responseTime
      };
    } catch (error) {
      logger.error('Failed to collect metrics', error);

      // Return safe defaults
      return {
        cpu: 0,
        memory: 0,
        activeConnections: 0,
        requestRate: 0,
        queueDepth: 0,
        responseTime: 0
      };
    }
  }

  /**
   * Calculate CPU usage percentage
   */
  private calculateCPUUsage(): number {
    const usage = process.cpuUsage();
    const total = usage.user + usage.system;

    // Convert to percentage (rough estimate)
    return Math.min((total / 1000000) * 100, 100);
  }

  /**
   * Calculate memory usage percentage
   */
  private calculateMemoryUsage(): number {
    const usage = process.memoryUsage();
    const totalMemory = require('os').totalmem();

    return (usage.heapUsed / totalMemory) * 100;
  }

  /**
   * Calculate request rate (requests per second)
   */
  private calculateRequestRate(): number {
    // This would need to be tracked separately
    // For now, return 0 as placeholder
    return 0;
  }

  /**
   * Calculate average response time
   */
  private calculateAverageResponseTime(): number {
    // This would need to be tracked separately
    // For now, return 0 as placeholder
    return 0;
  }

  /**
   * Record scaling decision in history
   */
  private recordScalingDecision(decision: ScalingDecision): void {
    this.scalingHistory.push(decision);

    // Keep only last 100 decisions
    if (this.scalingHistory.length > 100) {
      this.scalingHistory = this.scalingHistory.slice(-100);
    }
  }

  /**
   * Get scaling history
   */
  getScalingHistory(limit?: number): ScalingDecision[] {
    const history = [...this.scalingHistory].reverse();

    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Get current instance count
   */
  getCurrentInstances(): number {
    return this.currentInstances;
  }

  /**
   * Manually set instance count
   */
  setInstanceCount(count: number): void {
    if (count < this.config.minInstances || count > this.config.maxInstances) {
      throw new Error(`Instance count must be between ${this.config.minInstances} and ${this.config.maxInstances}`);
    }

    logger.info('Manually setting instance count', {
      from: this.currentInstances,
      to: count
    });

    this.currentInstances = count;
    this.emit('manualScale', { count });
  }

  /**
   * Get auto-scaler statistics
   */
  getStats() {
    const recentDecisions = this.getScalingHistory(10);
    const scaleUps = this.scalingHistory.filter(d => d.action === 'scale-up').length;
    const scaleDowns = this.scalingHistory.filter(d => d.action === 'scale-down').length;

    return {
      enabled: this.config.enabled,
      currentInstances: this.currentInstances,
      minInstances: this.config.minInstances,
      maxInstances: this.config.maxInstances,
      lastScalingAction: this.lastScalingAction,
      inCooldown: this.isInCooldown(),
      totalScaleUps: scaleUps,
      totalScaleDowns: scaleDowns,
      totalDecisions: this.scalingHistory.length,
      recentDecisions
    };
  }

  /**
   * Enable auto-scaling
   */
  enable(): void {
    this.config.enabled = true;
    logger.info('Auto-scaler enabled');
  }

  /**
   * Disable auto-scaling
   */
  disable(): void {
    this.config.enabled = false;
    logger.info('Auto-scaler disabled');
  }
}

// Singleton instance
let autoScaler: AutoScaler | null = null;

export function createAutoScaler(config: AutoScalerConfig, initialInstances: number): AutoScaler {
  if (autoScaler) {
    throw new Error('Auto-scaler already initialized');
  }

  autoScaler = new AutoScaler(config, initialInstances);
  return autoScaler;
}

export function getAutoScaler(): AutoScaler {
  if (!autoScaler) {
    throw new Error('Auto-scaler not initialized');
  }

  return autoScaler;
}
