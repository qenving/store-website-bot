import { EventEmitter } from 'events';
import { createLogger } from '../logging/logger';
import { HealthChecker } from './HealthChecker';
import { alertService } from '../monitoring/alertService';

const logger = createLogger({ module: 'FailoverManager' });

export interface FailoverConfig {
  enabled: boolean;
  autoRestart: boolean;
  maxRestartAttempts: number;
  restartDelay: number;
  gracefulShutdownTimeout: number;
  notifyOnFailover: boolean;
}

export interface FailoverAction {
  service: string;
  action: 'restart' | 'switch' | 'notify';
  timestamp: Date;
  success: boolean;
  error?: string;
}

export interface FailoverHistory {
  service: string;
  actions: FailoverAction[];
  lastFailover: Date | null;
  totalFailovers: number;
}

/**
 * Failover Manager for automatic service recovery
 * Handles service failures and orchestrates recovery actions
 */
export class FailoverManager extends EventEmitter {
  private config: FailoverConfig;
  private healthChecker: HealthChecker;
  private failoverHistory: Map<string, FailoverHistory> = new Map();
  private restartAttempts: Map<string, number> = new Map();
  private isShuttingDown: boolean = false;

  constructor(config: FailoverConfig, healthChecker: HealthChecker) {
    super();
    this.config = config;
    this.healthChecker = healthChecker;

    this.setupHealthCheckerHandlers();
  }

  /**
   * Setup handlers for health checker events
   */
  private setupHealthCheckerHandlers(): void {
    this.healthChecker.on('serviceUnhealthy', (serviceName: string) => {
      if (this.config.enabled && !this.isShuttingDown) {
        this.handleServiceFailure(serviceName).catch(error => {
          logger.error(`Failed to handle service failure for ${serviceName}`, error);
        });
      }
    });

    this.healthChecker.on('criticalFailure', (serviceName: string) => {
      if (this.config.enabled && !this.isShuttingDown) {
        this.handleCriticalFailure(serviceName).catch(error => {
          logger.error(`Failed to handle critical failure for ${serviceName}`, error);
        });
      }
    });

    this.healthChecker.on('serviceHealthy', (serviceName: string) => {
      // Reset restart attempts when service becomes healthy
      this.restartAttempts.delete(serviceName);
    });
  }

  /**
   * Handle service failure
   */
  private async handleServiceFailure(serviceName: string): Promise<void> {
    logger.warn(`Handling service failure: ${serviceName}`);

    // Check restart attempts
    const attempts = this.restartAttempts.get(serviceName) || 0;

    if (attempts >= this.config.maxRestartAttempts) {
      logger.error(`Service ${serviceName} exceeded max restart attempts`, {
        attempts,
        maxAttempts: this.config.maxRestartAttempts
      });

      await this.recordFailoverAction(serviceName, 'notify', false, 'Max restart attempts exceeded');

      // Send alert
      if (this.config.notifyOnFailover) {
        await this.sendFailoverAlert(serviceName, 'Max restart attempts exceeded');
      }

      this.emit('maxRestartsExceeded', serviceName);
      return;
    }

    // Attempt restart
    if (this.config.autoRestart) {
      await this.attemptServiceRestart(serviceName);
    } else {
      // Just notify
      await this.sendFailoverAlert(serviceName, 'Service unhealthy, auto-restart disabled');
      await this.recordFailoverAction(serviceName, 'notify', true);
    }
  }

  /**
   * Handle critical failure
   */
  private async handleCriticalFailure(serviceName: string): Promise<void> {
    logger.error(`Critical failure detected: ${serviceName}`);

    // Send immediate alert
    await this.sendCriticalAlert(serviceName);

    // Emit critical event
    this.emit('criticalFailure', serviceName);

    // Attempt immediate recovery
    if (this.config.autoRestart) {
      await this.attemptServiceRestart(serviceName);
    }
  }

  /**
   * Attempt to restart a service
   */
  private async attemptServiceRestart(serviceName: string): Promise<void> {
    const attempts = (this.restartAttempts.get(serviceName) || 0) + 1;
    this.restartAttempts.set(serviceName, attempts);

    logger.info(`Attempting to restart service: ${serviceName}`, {
      attempt: attempts,
      maxAttempts: this.config.maxRestartAttempts
    });

    try {
      // Wait before restart
      await new Promise(resolve => setTimeout(resolve, this.config.restartDelay));

      // Perform restart based on service type
      await this.restartService(serviceName);

      // Wait for service to come back
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check if service is now healthy
      const isHealthy = await this.healthChecker.checkServiceHealth(serviceName);

      if (isHealthy) {
        logger.info(`Service ${serviceName} restarted successfully`);
        await this.recordFailoverAction(serviceName, 'restart', true);
        this.restartAttempts.delete(serviceName);

        if (this.config.notifyOnFailover) {
          await this.sendFailoverAlert(serviceName, 'Service restarted successfully');
        }

        this.emit('restartSuccess', serviceName);
      } else {
        logger.warn(`Service ${serviceName} still unhealthy after restart`);
        await this.recordFailoverAction(serviceName, 'restart', false, 'Service still unhealthy');

        this.emit('restartFailed', serviceName);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(`Failed to restart service ${serviceName}`, error);
      await this.recordFailoverAction(serviceName, 'restart', false, errorMessage);

      this.emit('restartError', { serviceName, error });
    }
  }

  /**
   * Restart a service (implementation depends on service type)
   */
  private async restartService(serviceName: string): Promise<void> {
    logger.info(`Restarting service: ${serviceName}`);

    switch (serviceName) {
      case 'bot':
        // Bot restart would be handled by shard manager or cluster manager
        this.emit('restartServiceRequest', { service: 'bot' });
        break;

      case 'database':
        // Database restart usually requires manual intervention
        logger.error('Database restart requires manual intervention');
        throw new Error('Database restart not automated');

      case 'redis':
        // Redis restart usually requires manual intervention
        logger.error('Redis restart requires manual intervention');
        throw new Error('Redis restart not automated');

      default:
        if (serviceName.startsWith('payment:')) {
          // Payment gateway reconnection
          this.emit('restartServiceRequest', { service: serviceName });
        } else if (serviceName.startsWith('queue:')) {
          // Queue worker restart
          this.emit('restartServiceRequest', { service: serviceName });
        } else {
          logger.warn(`Unknown service type for restart: ${serviceName}`);
        }
    }
  }

  /**
   * Record failover action in history
   */
  private async recordFailoverAction(
    serviceName: string,
    action: FailoverAction['action'],
    success: boolean,
    error?: string
  ): Promise<void> {
    let history = this.failoverHistory.get(serviceName);

    if (!history) {
      history = {
        service: serviceName,
        actions: [],
        lastFailover: null,
        totalFailovers: 0
      };
    }

    const failoverAction: FailoverAction = {
      service: serviceName,
      action,
      timestamp: new Date(),
      success,
      error
    };

    history.actions.push(failoverAction);
    history.lastFailover = new Date();
    history.totalFailovers++;

    // Keep only last 50 actions
    if (history.actions.length > 50) {
      history.actions = history.actions.slice(-50);
    }

    this.failoverHistory.set(serviceName, history);

    this.emit('failoverAction', failoverAction);
  }

  /**
   * Send failover alert
   */
  private async sendFailoverAlert(serviceName: string, message: string): Promise<void> {
    try {
      await alertService.sendAlert({
        title: `Failover: ${serviceName}`,
        message,
        severity: 'warning',
        source: 'FailoverManager',
        metadata: {
          service: serviceName,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to send failover alert', error);
    }
  }

  /**
   * Send critical alert
   */
  private async sendCriticalAlert(serviceName: string): Promise<void> {
    try {
      await alertService.sendAlert({
        title: `🚨 CRITICAL: ${serviceName} Failed`,
        message: `Critical service ${serviceName} has failed. Immediate attention required!`,
        severity: 'critical',
        source: 'FailoverManager',
        metadata: {
          service: serviceName,
          timestamp: new Date().toISOString(),
          isCritical: true
        }
      });
    } catch (error) {
      logger.error('Failed to send critical alert', error);
    }
  }

  /**
   * Get failover history for a service
   */
  getFailoverHistory(serviceName: string): FailoverHistory | undefined {
    return this.failoverHistory.get(serviceName);
  }

  /**
   * Get all failover histories
   */
  getAllFailoverHistories(): FailoverHistory[] {
    return Array.from(this.failoverHistory.values());
  }

  /**
   * Get failover statistics
   */
  getStats() {
    const histories = this.getAllFailoverHistories();

    return {
      totalServices: histories.length,
      totalFailovers: histories.reduce((sum, h) => sum + h.totalFailovers, 0),
      recentFailovers: histories.filter(h => {
        if (!h.lastFailover) return false;
        const hourAgo = new Date(Date.now() - 3600000);
        return h.lastFailover > hourAgo;
      }).length,
      servicesWithFailovers: histories.map(h => ({
        service: h.service,
        totalFailovers: h.totalFailovers,
        lastFailover: h.lastFailover,
        recentActions: h.actions.slice(-5)
      }))
    };
  }

  /**
   * Enable failover
   */
  enable(): void {
    this.config.enabled = true;
    logger.info('Failover manager enabled');
  }

  /**
   * Disable failover
   */
  disable(): void {
    this.config.enabled = false;
    logger.info('Failover manager disabled');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down failover manager...');

    this.isShuttingDown = true;
    this.config.enabled = false;

    // Give ongoing failover operations time to complete
    await new Promise(resolve => setTimeout(resolve, this.config.gracefulShutdownTimeout));

    logger.info('Failover manager shut down');
  }
}

// Singleton instance
let failoverManager: FailoverManager | null = null;

export function createFailoverManager(
  config: FailoverConfig,
  healthChecker: HealthChecker
): FailoverManager {
  if (failoverManager) {
    throw new Error('Failover manager already initialized');
  }

  failoverManager = new FailoverManager(config, healthChecker);
  return failoverManager;
}

export function getFailoverManager(): FailoverManager {
  if (!failoverManager) {
    throw new Error('Failover manager not initialized');
  }

  return failoverManager;
}
