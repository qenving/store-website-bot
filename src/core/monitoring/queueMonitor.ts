import { reconcileQueue } from '../../queues/reconcileQueue';
import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'QueueMonitor' });

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface QueueHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'critical';
  stats: QueueStats;
  failureRate: number;
  avgProcessingTime: number;
  lastUpdate: Date;
}

export class QueueMonitor {
  private queues: Map<string, any> = new Map();
  private statsHistory: Map<string, QueueStats[]> = new Map();
  private maxHistoryRecords = 100;

  registerQueue(name: string, queue: any): void {
    this.queues.set(name, queue);
    this.statsHistory.set(name, []);

    logger.info('Queue registered for monitoring', { name });
  }

  async getQueueStats(name: string): Promise<QueueStats | null> {
    const queue = this.queues.get(name);
    if (!queue) {
      return null;
    }

    try {
      // Special handling for reconcileQueue
      if (name === 'reconciliation') {
        const stats = await reconcileQueue.getQueueStatus();
        return {
          name,
          ...stats,
          paused: false
        };
      }

      // Generic queue stats (BullMQ)
      if (queue.getJobCounts) {
        const counts = await queue.getJobCounts();
        const isPaused = await queue.isPaused?.();

        return {
          name,
          waiting: counts.waiting || 0,
          active: counts.active || 0,
          completed: counts.completed || 0,
          failed: counts.failed || 0,
          delayed: counts.delayed || 0,
          paused: isPaused || false
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to get queue stats', { name, error });
      return null;
    }
  }

  async getAllQueueStats(): Promise<QueueStats[]> {
    const stats: QueueStats[] = [];

    for (const name of this.queues.keys()) {
      const queueStats = await this.getQueueStats(name);
      if (queueStats) {
        stats.push(queueStats);
        this.recordStats(name, queueStats);
      }
    }

    return stats;
  }

  private recordStats(name: string, stats: QueueStats): void {
    if (!this.statsHistory.has(name)) {
      this.statsHistory.set(name, []);
    }

    const history = this.statsHistory.get(name)!;
    history.push({ ...stats });

    if (history.length > this.maxHistoryRecords) {
      history.shift();
    }
  }

  async getQueueHealth(name: string): Promise<QueueHealth | null> {
    const stats = await this.getQueueStats(name);
    if (!stats) {
      return null;
    }

    const history = this.statsHistory.get(name) || [];

    // Calculate failure rate
    const totalJobs = stats.completed + stats.failed;
    const failureRate =
      totalJobs > 0 ? (stats.failed / totalJobs) * 100 : 0;

    // Determine health status
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';

    if (stats.failed > 100 || failureRate > 20) {
      status = 'critical';
    } else if (stats.failed > 50 || failureRate > 10 || stats.waiting > 1000) {
      status = 'degraded';
    }

    // Calculate average processing time (simplified)
    const avgProcessingTime = 0; // Would need job duration tracking

    return {
      name,
      status,
      stats,
      failureRate: Math.round(failureRate * 100) / 100,
      avgProcessingTime,
      lastUpdate: new Date()
    };
  }

  async getAllQueueHealth(): Promise<QueueHealth[]> {
    const health: QueueHealth[] = [];

    for (const name of this.queues.keys()) {
      const queueHealth = await this.getQueueHealth(name);
      if (queueHealth) {
        health.push(queueHealth);
      }
    }

    return health;
  }

  getQueueHistory(name: string, last: number = 50): QueueStats[] {
    const history = this.statsHistory.get(name);
    if (!history) {
      return [];
    }

    return history.slice(-last);
  }

  async checkForAlerts(): Promise<Array<{ queue: string; alert: string }>> {
    const alerts: Array<{ queue: string; alert: string }> = [];

    for (const name of this.queues.keys()) {
      const health = await this.getQueueHealth(name);
      if (!health) continue;

      if (health.status === 'critical') {
        alerts.push({
          queue: name,
          alert: `Queue critical: ${health.stats.failed} failed jobs, ${health.failureRate.toFixed(1)}% failure rate`
        });
      }

      if (health.stats.waiting > 1000) {
        alerts.push({
          queue: name,
          alert: `Queue backlog: ${health.stats.waiting} jobs waiting`
        });
      }
    }

    return alerts;
  }

  async initialize(): Promise<void> {
    // Register known queues
    this.registerQueue('reconciliation', reconcileQueue);

    logger.info('Queue monitor initialized');
  }
}

export const queueMonitor = new QueueMonitor();
