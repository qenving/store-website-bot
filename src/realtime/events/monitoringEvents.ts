import { Server as SocketIOServer } from 'socket.io';
import { SystemHealth } from '../../core/monitoring/healthService';
import { GatewayHealthStats } from '../../core/monitoring/gatewayHealthService';
import { QueueHealth } from '../../core/monitoring/queueMonitor';
import { CronStats } from '../../core/monitoring/cronHistory';
import { createLogger } from '../../core/logging/logger';

const logger = createLogger({ module: 'MonitoringEvents' });

export class MonitoringEvents {
  private io: SocketIOServer | null = null;

  setSocketServer(io: SocketIOServer): void {
    this.io = io;
    logger.info('Socket.io server registered for monitoring events');
  }

  emitMonitoringUpdate(data: SystemHealth): void {
    if (!this.io) return;

    this.io.emit('monitoring:update', {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  emitGatewayHealthUpdate(gatewayHealth: Map<string, GatewayHealthStats>): void {
    if (!this.io) return;

    const gateways: Record<string, any> = {};
    for (const [provider, health] of gatewayHealth.entries()) {
      gateways[provider] = {
        status: health.status,
        latency: health.currentLatency,
        averageLatency: health.averageLatency,
        uptime24h: health.uptime24h,
        errors24h: health.errors24h,
        lastCheck: health.lastCheck.toISOString()
      };
    }

    this.io.emit('monitoring:gateway_health', {
      gateways,
      timestamp: new Date().toISOString()
    });
  }

  emitQueueUpdate(queues: QueueHealth[]): void {
    if (!this.io) return;

    this.io.emit('monitoring:queue_update', {
      queues,
      timestamp: new Date().toISOString()
    });
  }

  emitApiLatencyUpdate(service: string, latency: number): void {
    if (!this.io) return;

    this.io.emit('monitoring:api_latency', {
      service,
      latency,
      timestamp: new Date().toISOString()
    });
  }

  emitCronUpdate(cronStats: CronStats[]): void {
    if (!this.io) return;

    this.io.emit('monitoring:cron_update', {
      crons: cronStats,
      timestamp: new Date().toISOString()
    });
  }

  emitPerformanceUpdate(data: {
    cpu: number;
    memory: number;
    uptime: number;
  }): void {
    if (!this.io) return;

    this.io.emit('monitoring:performance', {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  emitAlert(alert: {
    severity: string;
    title: string;
    message: string;
  }): void {
    if (!this.io) return;

    this.io.emit('monitoring:alert', {
      ...alert,
      timestamp: new Date().toISOString()
    });

    logger.info('Monitoring alert emitted', {
      severity: alert.severity,
      title: alert.title
    });
  }

  emitServiceStatusChange(service: string, status: 'ok' | 'degraded' | 'down'): void {
    if (!this.io) return;

    this.io.emit('monitoring:service_status', {
      service,
      status,
      timestamp: new Date().toISOString()
    });

    logger.info('Service status change emitted', { service, status });
  }

  emitMetricUpdate(metric: {
    name: string;
    value: number;
    labels?: Record<string, string>;
  }): void {
    if (!this.io) return;

    this.io.emit('monitoring:metric', {
      ...metric,
      timestamp: new Date().toISOString()
    });
  }
}

export const monitoringEvents = new MonitoringEvents();
