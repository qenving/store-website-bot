import { uptimeService } from './uptimeService';
import { latencyService } from './latencyService';
import { gatewayHealthService } from './gatewayHealthService';
import { queueMonitor } from './queueMonitor';
import { cronHistory } from './cronHistory';
import { dal } from '../db/dal';
import { PaymentProvider } from '../payments/paymentTypes';
import { createLogger } from '../logging/logger';
import * as os from 'os';

const logger = createLogger({ module: 'MetricsService' });

export class MetricsService {
  async getPrometheusMetrics(): Promise<string> {
    const metrics: string[] = [];

    // Add header
    metrics.push('# HELP transaction_total Total number of transactions');
    metrics.push('# TYPE transaction_total counter');

    try {
      // Transaction metrics
      const transactions = await dal.transactions.list();

      const statusCounts = new Map<string, number>();
      const gatewayCounts = new Map<string, Map<string, number>>();

      for (const tx of transactions) {
        // Count by status
        statusCounts.set(tx.status, (statusCounts.get(tx.status) || 0) + 1);

        // Count by gateway and status
        if (!gatewayCounts.has(tx.provider)) {
          gatewayCounts.set(tx.provider, new Map());
        }
        const providerMap = gatewayCounts.get(tx.provider)!;
        providerMap.set(tx.status, (providerMap.get(tx.status) || 0) + 1);
      }

      for (const [status, count] of statusCounts.entries()) {
        metrics.push(`transaction_total{status="${status}"} ${count}`);
      }

      metrics.push('');
      metrics.push('# HELP transaction_gateway_total Total transactions per gateway');
      metrics.push('# TYPE transaction_gateway_total counter');

      for (const [gateway, statusMap] of gatewayCounts.entries()) {
        for (const [status, count] of statusMap.entries()) {
          metrics.push(
            `transaction_gateway_total{gateway="${gateway}",status="${status}"} ${count}`
          );
        }
      }
    } catch (error) {
      logger.error('Failed to collect transaction metrics', error);
    }

    // Gateway latency metrics
    metrics.push('');
    metrics.push('# HELP gateway_latency_ms Gateway response latency in milliseconds');
    metrics.push('# TYPE gateway_latency_ms gauge');

    const gatewayHealth = gatewayHealthService.getAllGatewayHealth();
    for (const [provider, health] of gatewayHealth.entries()) {
      metrics.push(
        `gateway_latency_ms{gateway="${provider}"} ${health.currentLatency}`
      );
    }

    // Gateway status metrics
    metrics.push('');
    metrics.push('# HELP gateway_up Gateway availability (1=up, 0=down)');
    metrics.push('# TYPE gateway_up gauge');

    for (const [provider, health] of gatewayHealth.entries()) {
      const up = health.status === 'up' ? 1 : 0;
      metrics.push(`gateway_up{gateway="${provider}"} ${up}`);
    }

    // Gateway uptime percentage
    metrics.push('');
    metrics.push('# HELP gateway_uptime_24h Gateway uptime percentage in last 24h');
    metrics.push('# TYPE gateway_uptime_24h gauge');

    for (const [provider, health] of gatewayHealth.entries()) {
      metrics.push(
        `gateway_uptime_24h{gateway="${provider}"} ${health.uptime24h}`
      );
    }

    // Queue metrics
    metrics.push('');
    metrics.push('# HELP queue_jobs_total Total jobs in queue');
    metrics.push('# TYPE queue_jobs_total gauge');

    try {
      const queueStats = await queueMonitor.getAllQueueStats();
      for (const queue of queueStats) {
        metrics.push(`queue_jobs_total{name="${queue.name}",type="waiting"} ${queue.waiting}`);
        metrics.push(`queue_jobs_total{name="${queue.name}",type="active"} ${queue.active}`);
        metrics.push(`queue_jobs_total{name="${queue.name}",type="completed"} ${queue.completed}`);
        metrics.push(`queue_jobs_total{name="${queue.name}",type="failed"} ${queue.failed}`);
      }
    } catch (error) {
      logger.error('Failed to collect queue metrics', error);
    }

    // Uptime metrics
    metrics.push('');
    metrics.push('# HELP uptime_seconds Service uptime in seconds');
    metrics.push('# TYPE uptime_seconds gauge');

    const uptimes = uptimeService.getAllUptimes();
    for (const uptime of uptimes) {
      const seconds = Math.floor(uptime.uptime / 1000);
      metrics.push(`uptime_seconds{service="${uptime.service}"} ${seconds}`);
    }

    // API latency metrics
    metrics.push('');
    metrics.push('# HELP api_response_time_ms API response time in milliseconds');
    metrics.push('# TYPE api_response_time_ms gauge');

    const latencyStats = latencyService.getAllLatencyStats();
    for (const [service, stats] of latencyStats.entries()) {
      metrics.push(`api_response_time_ms{service="${service}",quantile="0.50"} ${stats.p50}`);
      metrics.push(`api_response_time_ms{service="${service}",quantile="0.95"} ${stats.p95}`);
      metrics.push(`api_response_time_ms{service="${service}",quantile="0.99"} ${stats.p99}`);
    }

    // System metrics
    metrics.push('');
    metrics.push('# HELP cpu_usage_percent CPU usage percentage');
    metrics.push('# TYPE cpu_usage_percent gauge');

    const cpuUsage = process.cpuUsage();
    const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000) / os.cpus().length;
    metrics.push(`cpu_usage_percent ${cpuPercent.toFixed(2)}`);

    metrics.push('');
    metrics.push('# HELP memory_usage_bytes Memory usage in bytes');
    metrics.push('# TYPE memory_usage_bytes gauge');

    const memUsage = process.memoryUsage();
    metrics.push(`memory_usage_bytes{type="rss"} ${memUsage.rss}`);
    metrics.push(`memory_usage_bytes{type="heap_total"} ${memUsage.heapTotal}`);
    metrics.push(`memory_usage_bytes{type="heap_used"} ${memUsage.heapUsed}`);
    metrics.push(`memory_usage_bytes{type="external"} ${memUsage.external}`);

    // Cron metrics
    metrics.push('');
    metrics.push('# HELP cron_last_run_timestamp Last run timestamp of cron jobs');
    metrics.push('# TYPE cron_last_run_timestamp gauge');

    metrics.push('');
    metrics.push('# HELP cron_duration_seconds Duration of last cron job execution');
    metrics.push('# TYPE cron_duration_seconds gauge');

    const cronStats = cronHistory.getAllCronStats();
    for (const cron of cronStats) {
      if (cron.lastRun) {
        const timestamp = Math.floor(cron.lastRun.getTime() / 1000);
        metrics.push(`cron_last_run_timestamp{task="${cron.taskName}"} ${timestamp}`);
      }

      if (cron.lastDuration) {
        const seconds = cron.lastDuration / 1000;
        metrics.push(`cron_duration_seconds{task="${cron.taskName}"} ${seconds.toFixed(3)}`);
      }
    }

    return metrics.join('\n');
  }

  async getMetricsJSON(): Promise<Record<string, any>> {
    const metrics: Record<string, any> = {};

    try {
      // Transaction metrics
      const transactions = await dal.transactions.list();
      metrics.transactions = {
        total: transactions.length,
        byStatus: {},
        byGateway: {}
      };

      for (const tx of transactions) {
        metrics.transactions.byStatus[tx.status] =
          (metrics.transactions.byStatus[tx.status] || 0) + 1;

        if (!metrics.transactions.byGateway[tx.provider]) {
          metrics.transactions.byGateway[tx.provider] = {};
        }
        metrics.transactions.byGateway[tx.provider][tx.status] =
          (metrics.transactions.byGateway[tx.provider][tx.status] || 0) + 1;
      }
    } catch (error) {
      logger.error('Failed to collect transaction metrics', error);
      metrics.transactions = { error: 'Failed to collect' };
    }

    // Gateway metrics
    metrics.gateways = {};
    const gatewayHealth = gatewayHealthService.getAllGatewayHealth();
    for (const [provider, health] of gatewayHealth.entries()) {
      metrics.gateways[provider] = {
        status: health.status,
        latency: health.currentLatency,
        uptime24h: health.uptime24h,
        errors24h: health.errors24h
      };
    }

    // Queue metrics
    try {
      const queueStats = await queueMonitor.getAllQueueStats();
      metrics.queues = {};
      for (const queue of queueStats) {
        metrics.queues[queue.name] = {
          waiting: queue.waiting,
          active: queue.active,
          completed: queue.completed,
          failed: queue.failed
        };
      }
    } catch (error) {
      logger.error('Failed to collect queue metrics', error);
      metrics.queues = { error: 'Failed to collect' };
    }

    // Uptime metrics
    metrics.uptime = {};
    const uptimes = uptimeService.getAllUptimes();
    for (const uptime of uptimes) {
      metrics.uptime[uptime.service] = Math.floor(uptime.uptime / 1000);
    }

    // Latency metrics
    metrics.latency = {};
    const latencyStats = latencyService.getAllLatencyStats();
    for (const [service, stats] of latencyStats.entries()) {
      metrics.latency[service] = {
        current: stats.current,
        average: stats.average,
        p95: stats.p95,
        p99: stats.p99
      };
    }

    // System metrics
    metrics.system = {
      cpu: {
        usage: process.cpuUsage(),
        cores: os.cpus().length
      },
      memory: process.memoryUsage(),
      platform: os.platform(),
      uptime: os.uptime()
    };

    // Cron metrics
    metrics.cron = {};
    const cronStats = cronHistory.getAllCronStats();
    for (const cron of cronStats) {
      metrics.cron[cron.taskName] = {
        lastRun: cron.lastRun,
        lastDuration: cron.lastDuration,
        lastStatus: cron.lastStatus,
        successRate: cron.successRate,
        isRunning: cron.isRunning
      };
    }

    return metrics;
  }
}

export const metricsService = new MetricsService();
