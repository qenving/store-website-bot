import { uptimeService } from './uptimeService';
import { latencyService } from './latencyService';
import { gatewayHealthService, GatewayStatus } from './gatewayHealthService';
import { queueMonitor } from './queueMonitor';
import { dal } from '../db/dal';
import { PaymentProvider } from '../payments/paymentTypes';
import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'HealthService' });

export type SystemStatus = 'ok' | 'degraded' | 'down';

export interface ServiceHealth {
  status: SystemStatus;
  uptime?: number;
  ping?: number;
  latency?: number;
  message?: string;
}

export interface QueueHealth {
  waiting: number;
  active: number;
  failed: number;
}

export interface GatewayHealth {
  status: SystemStatus;
  latency: number;
  errors24h: number;
}

export interface SystemHealth {
  status: SystemStatus;
  timestamp: Date;
  bot: ServiceHealth;
  website: ServiceHealth;
  api: ServiceHealth;
  database: ServiceHealth;
  redis: ServiceHealth;
  paymentGateways: Record<string, GatewayHealth>;
  queues: Record<string, QueueHealth>;
}

export class HealthService {
  async getSystemHealth(): Promise<SystemHealth> {
    const timestamp = new Date();

    // Check bot health
    const bot = await this.checkBotHealth();

    // Check website health
    const website = await this.checkWebsiteHealth();

    // Check API health
    const api = await this.checkApiHealth();

    // Check database health
    const database = await this.checkDatabaseHealth();

    // Check Redis health
    const redis = await this.checkRedisHealth();

    // Check payment gateways
    const paymentGateways = await this.checkPaymentGateways();

    // Check queues
    const queues = await this.checkQueues();

    // Determine overall status
    const status = this.determineOverallStatus({
      bot,
      website,
      api,
      database,
      redis,
      paymentGateways,
      queues
    });

    return {
      status,
      timestamp,
      bot,
      website,
      api,
      database,
      redis,
      paymentGateways,
      queues
    };
  }

  private async checkBotHealth(): Promise<ServiceHealth> {
    try {
      const uptime = uptimeService.getUptime('bot');
      const ping = latencyService.getCurrentLatency('bot_ping');

      if (uptime === 0) {
        return {
          status: 'down',
          message: 'Bot not running'
        };
      }

      return {
        status: 'ok',
        uptime,
        ping: ping || undefined
      };
    } catch (error) {
      logger.error('Failed to check bot health', error);
      return {
        status: 'down',
        message: 'Health check failed'
      };
    }
  }

  private async checkWebsiteHealth(): Promise<ServiceHealth> {
    try {
      const latency = latencyService.getCurrentLatency('website');

      if (!latency) {
        return {
          status: 'down',
          message: 'No latency data'
        };
      }

      const status = latency < 1000 ? 'ok' : latency < 3000 ? 'degraded' : 'down';

      return {
        status,
        latency
      };
    } catch (error) {
      logger.error('Failed to check website health', error);
      return {
        status: 'down',
        message: 'Health check failed'
      };
    }
  }

  private async checkApiHealth(): Promise<ServiceHealth> {
    try {
      const latency = latencyService.getCurrentLatency('api');

      if (!latency) {
        return {
          status: 'ok',
          latency: 0
        };
      }

      const status = latency < 500 ? 'ok' : latency < 2000 ? 'degraded' : 'down';

      return {
        status,
        latency
      };
    } catch (error) {
      logger.error('Failed to check API health', error);
      return {
        status: 'down',
        message: 'Health check failed'
      };
    }
  }

  private async checkDatabaseHealth(): Promise<ServiceHealth> {
    const start = Date.now();

    try {
      // Try to read a simple setting
      await dal.settings.get('health_check');

      const latency = Date.now() - start;
      const status = latency < 100 ? 'ok' : latency < 500 ? 'degraded' : 'down';

      return {
        status,
        latency
      };
    } catch (error) {
      logger.error('Failed to check database health', error);
      return {
        status: 'down',
        latency: Date.now() - start,
        message: 'Database connection failed'
      };
    }
  }

  private async checkRedisHealth(): Promise<ServiceHealth> {
    try {
      // Check if Redis is available via queue monitor
      const queueStats = await queueMonitor.getQueueStats('reconciliation');

      if (queueStats) {
        return {
          status: 'ok',
          message: 'Redis connected via queue'
        };
      }

      return {
        status: 'degraded',
        message: 'Redis status unknown'
      };
    } catch (error) {
      logger.warn('Redis health check inconclusive', error);
      return {
        status: 'degraded',
        message: 'Redis not available (optional)'
      };
    }
  }

  private async checkPaymentGateways(): Promise<Record<string, GatewayHealth>> {
    const gateways: Record<string, GatewayHealth> = {};

    const gatewayHealth = gatewayHealthService.getAllGatewayHealth();

    for (const [provider, health] of gatewayHealth.entries()) {
      let status: SystemStatus;

      if (health.status === GatewayStatus.UP) {
        status = 'ok';
      } else if (health.status === GatewayStatus.DEGRADED) {
        status = 'degraded';
      } else {
        status = 'down';
      }

      gateways[provider] = {
        status,
        latency: health.currentLatency,
        errors24h: health.errors24h
      };
    }

    return gateways;
  }

  private async checkQueues(): Promise<Record<string, QueueHealth>> {
    const queues: Record<string, QueueHealth> = {};

    try {
      const queueStats = await queueMonitor.getAllQueueStats();

      for (const queue of queueStats) {
        queues[queue.name] = {
          waiting: queue.waiting,
          active: queue.active,
          failed: queue.failed
        };
      }
    } catch (error) {
      logger.error('Failed to check queue health', error);
    }

    return queues;
  }

  private determineOverallStatus(components: {
    bot: ServiceHealth;
    website: ServiceHealth;
    api: ServiceHealth;
    database: ServiceHealth;
    redis: ServiceHealth;
    paymentGateways: Record<string, GatewayHealth>;
    queues: Record<string, QueueHealth>;
  }): SystemStatus {
    // Critical components: bot, database
    if (components.bot.status === 'down' || components.database.status === 'down') {
      return 'down';
    }

    // Check if any critical component is degraded
    if (
      components.bot.status === 'degraded' ||
      components.database.status === 'degraded' ||
      components.api.status === 'degraded'
    ) {
      return 'degraded';
    }

    // Check gateways - if more than 2 are down, system is degraded
    const gatewayStatuses = Object.values(components.paymentGateways).map(g => g.status);
    const gatewaysDown = gatewayStatuses.filter(s => s === 'down').length;

    if (gatewaysDown > 2) {
      return 'degraded';
    }

    // Check queues - if any have excessive failures
    for (const queue of Object.values(components.queues)) {
      if (queue.failed > 100) {
        return 'degraded';
      }
    }

    return 'ok';
  }

  async checkService(serviceName: string): Promise<ServiceHealth> {
    switch (serviceName) {
      case 'bot':
        return this.checkBotHealth();
      case 'website':
        return this.checkWebsiteHealth();
      case 'api':
        return this.checkApiHealth();
      case 'database':
        return this.checkDatabaseHealth();
      case 'redis':
        return this.checkRedisHealth();
      default:
        return {
          status: 'down',
          message: 'Unknown service'
        };
    }
  }
}

export const healthService = new HealthService();
