import { EventEmitter } from 'events';
import { createLogger } from '../logging/logger';
import { healthService } from '../monitoring/healthService';
import { SystemHealth } from '../monitoring/healthService';

const logger = createLogger({ module: 'HealthChecker' });

export interface HealthCheckConfig {
  interval: number;
  timeout: number;
  unhealthyThreshold: number;
  healthyThreshold: number;
}

export interface ServiceHealthStatus {
  service: string;
  healthy: boolean;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastCheck: Date;
  lastHealthy: Date | null;
  lastUnhealthy: Date | null;
}

/**
 * Health Checker for monitoring service health
 * Tracks consecutive failures and triggers failover when needed
 */
export class HealthChecker extends EventEmitter {
  private config: HealthCheckConfig;
  private serviceStatus: Map<string, ServiceHealthStatus> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private runningChecks: Set<string> = new Set();

  constructor(config: HealthCheckConfig) {
    super();
    this.config = config;
  }

  /**
   * Register a service for health monitoring
   */
  registerService(serviceName: string): void {
    if (this.serviceStatus.has(serviceName)) {
      logger.warn(`Service ${serviceName} already registered`);
      return;
    }

    this.serviceStatus.set(serviceName, {
      service: serviceName,
      healthy: true,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastCheck: new Date(),
      lastHealthy: new Date(),
      lastUnhealthy: null
    });

    logger.info(`Service registered for health monitoring: ${serviceName}`);
  }

  /**
   * Unregister a service
   */
  unregisterService(serviceName: string): void {
    this.serviceStatus.delete(serviceName);
    logger.info(`Service unregistered: ${serviceName}`);
  }

  /**
   * Start periodic health checks
   */
  start(): void {
    if (this.checkInterval) {
      logger.warn('Health checker already running');
      return;
    }

    this.checkInterval = setInterval(() => {
      this.performHealthChecks().catch(error => {
        logger.error('Health check error', error);
      });
    }, this.config.interval);

    logger.info('Health checker started', {
      interval: this.config.interval,
      unhealthyThreshold: this.config.unhealthyThreshold,
      healthyThreshold: this.config.healthyThreshold
    });

    // Perform initial check
    this.performHealthChecks().catch(error => {
      logger.error('Initial health check error', error);
    });
  }

  /**
   * Stop health checks
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Health checker stopped');
    }
  }

  /**
   * Perform health checks on all registered services
   */
  private async performHealthChecks(): Promise<void> {
    try {
      const systemHealth = await healthService.getSystemHealth();

      // Check bot health
      if (this.serviceStatus.has('bot')) {
        this.updateServiceHealth('bot', systemHealth.bot.status === 'ok');
      }

      // Check database health
      if (this.serviceStatus.has('database')) {
        this.updateServiceHealth('database', systemHealth.database.status === 'ok');
      }

      // Check Redis health
      if (this.serviceStatus.has('redis')) {
        this.updateServiceHealth('redis', systemHealth.redis.status === 'ok');
      }

      // Check payment gateways
      for (const [provider, health] of Object.entries(systemHealth.paymentGateways)) {
        const serviceName = `payment:${provider}`;
        if (this.serviceStatus.has(serviceName)) {
          this.updateServiceHealth(serviceName, health.status === 'UP');
        }
      }

      // Check queues
      for (const [queueName, health] of Object.entries(systemHealth.queues)) {
        const serviceName = `queue:${queueName}`;
        if (this.serviceStatus.has(serviceName)) {
          this.updateServiceHealth(serviceName, health.status === 'healthy');
        }
      }
    } catch (error) {
      logger.error('Failed to perform health checks', error);
    }
  }

  /**
   * Update service health status
   */
  private updateServiceHealth(serviceName: string, isHealthy: boolean): void {
    const status = this.serviceStatus.get(serviceName);
    if (!status) return;

    status.lastCheck = new Date();

    if (isHealthy) {
      status.consecutiveSuccesses++;
      status.consecutiveFailures = 0;

      // Check if service transitioned to healthy
      if (!status.healthy && status.consecutiveSuccesses >= this.config.healthyThreshold) {
        status.healthy = true;
        status.lastHealthy = new Date();

        logger.info(`Service ${serviceName} is now healthy`);
        this.emit('serviceHealthy', serviceName);
      }
    } else {
      status.consecutiveFailures++;
      status.consecutiveSuccesses = 0;

      // Check if service transitioned to unhealthy
      if (status.healthy && status.consecutiveFailures >= this.config.unhealthyThreshold) {
        status.healthy = false;
        status.lastUnhealthy = new Date();

        logger.error(`Service ${serviceName} is now unhealthy`, {
          consecutiveFailures: status.consecutiveFailures
        });

        this.emit('serviceUnhealthy', serviceName);

        // Trigger critical alert if configured
        if (this.shouldTriggerCriticalAlert(serviceName)) {
          this.emit('criticalFailure', serviceName);
        }
      }
    }

    this.serviceStatus.set(serviceName, status);
  }

  /**
   * Determine if critical alert should be triggered
   */
  private shouldTriggerCriticalAlert(serviceName: string): boolean {
    // Critical services that should trigger immediate alerts
    const criticalServices = ['bot', 'database', 'redis'];

    return criticalServices.includes(serviceName);
  }

  /**
   * Manually check service health
   */
  async checkServiceHealth(serviceName: string): Promise<boolean> {
    if (this.runningChecks.has(serviceName)) {
      logger.warn(`Health check already running for ${serviceName}`);
      return false;
    }

    this.runningChecks.add(serviceName);

    try {
      const systemHealth = await healthService.getSystemHealth();

      let isHealthy = false;

      switch (serviceName) {
        case 'bot':
          isHealthy = systemHealth.bot.status === 'ok';
          break;
        case 'database':
          isHealthy = systemHealth.database.status === 'ok';
          break;
        case 'redis':
          isHealthy = systemHealth.redis.status === 'ok';
          break;
        default:
          if (serviceName.startsWith('payment:')) {
            const provider = serviceName.replace('payment:', '');
            isHealthy = systemHealth.paymentGateways[provider]?.status === 'UP';
          } else if (serviceName.startsWith('queue:')) {
            const queueName = serviceName.replace('queue:', '');
            isHealthy = systemHealth.queues[queueName]?.status === 'healthy';
          }
      }

      this.updateServiceHealth(serviceName, isHealthy);

      return isHealthy;
    } finally {
      this.runningChecks.delete(serviceName);
    }
  }

  /**
   * Get service health status
   */
  getServiceStatus(serviceName: string): ServiceHealthStatus | undefined {
    return this.serviceStatus.get(serviceName);
  }

  /**
   * Get all service statuses
   */
  getAllServiceStatuses(): ServiceHealthStatus[] {
    return Array.from(this.serviceStatus.values());
  }

  /**
   * Get unhealthy services
   */
  getUnhealthyServices(): ServiceHealthStatus[] {
    return this.getAllServiceStatuses().filter(s => !s.healthy);
  }

  /**
   * Check if any critical service is unhealthy
   */
  hasCriticalFailure(): boolean {
    const criticalServices = ['bot', 'database', 'redis'];

    return criticalServices.some(service => {
      const status = this.serviceStatus.get(service);
      return status && !status.healthy;
    });
  }

  /**
   * Get health check statistics
   */
  getStats() {
    const statuses = this.getAllServiceStatuses();

    return {
      totalServices: statuses.length,
      healthyServices: statuses.filter(s => s.healthy).length,
      unhealthyServices: statuses.filter(s => !s.healthy).length,
      criticalFailures: this.hasCriticalFailure(),
      services: statuses.map(s => ({
        service: s.service,
        healthy: s.healthy,
        consecutiveFailures: s.consecutiveFailures,
        lastCheck: s.lastCheck,
        lastHealthy: s.lastHealthy,
        lastUnhealthy: s.lastUnhealthy
      }))
    };
  }
}

// Singleton instance
let healthChecker: HealthChecker | null = null;

export function createHealthChecker(config: HealthCheckConfig): HealthChecker {
  if (healthChecker) {
    throw new Error('Health checker already initialized');
  }

  healthChecker = new HealthChecker(config);
  return healthChecker;
}

export function getHealthChecker(): HealthChecker {
  if (!healthChecker) {
    throw new Error('Health checker not initialized');
  }

  return healthChecker;
}
