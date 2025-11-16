import { Queue, Worker, Job } from 'bullmq';
import { reconcileEngine } from '../core/reconciliation/reconcileEngine';
import { createLogger } from '../core/logging/logger';

const logger = createLogger({ module: 'ReconcileQueue' });

interface ReconcileJobData {
  type: 'auto' | 'manual';
  triggeredBy?: string;
  timestamp: Date;
}

export class ReconcileQueue {
  private queue: Queue<ReconcileJobData> | null = null;
  private worker: Worker<ReconcileJobData> | null = null;
  private redisConnection: any;

  constructor() {
    // Redis connection config
    this.redisConnection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null
    };
  }

  async initialize(): Promise<void> {
    try {
      // Create queue
      this.queue = new Queue<ReconcileJobData>('reconciliation', {
        connection: this.redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          },
          removeOnComplete: {
            count: 100 // Keep last 100 completed jobs
          },
          removeOnFail: {
            count: 50 // Keep last 50 failed jobs
          }
        }
      });

      // Create worker
      this.worker = new Worker<ReconcileJobData>(
        'reconciliation',
        async (job: Job<ReconcileJobData>) => {
          return this.processJob(job);
        },
        {
          connection: this.redisConnection,
          concurrency: 1 // Only run one reconciliation at a time
        }
      );

      // Event handlers
      this.worker.on('completed', (job) => {
        logger.info('Reconciliation job completed', {
          jobId: job.id,
          data: job.data
        });
      });

      this.worker.on('failed', (job, error) => {
        logger.error('Reconciliation job failed', {
          jobId: job?.id,
          error: error.message
        });
      });

      this.worker.on('error', (error) => {
        logger.error('Worker error', error);
      });

      logger.info('Reconciliation queue initialized');
    } catch (error) {
      logger.warn('Failed to initialize queue (Redis may not be available)', error);
      // Continue without queue - reconciliation will still work via direct calls
    }
  }

  async addReconcileJob(
    type: 'auto' | 'manual',
    triggeredBy?: string
  ): Promise<string | null> {
    if (!this.queue) {
      logger.warn('Queue not available, running reconciliation directly');
      // Run directly without queue
      await reconcileEngine.runReconciliation(type, triggeredBy);
      return null;
    }

    try {
      const job = await this.queue.add('reconcile', {
        type,
        triggeredBy,
        timestamp: new Date()
      });

      logger.info('Reconciliation job added to queue', {
        jobId: job.id,
        type,
        triggeredBy
      });

      return job.id || null;
    } catch (error) {
      logger.error('Failed to add job to queue', error);
      // Fallback: run directly
      await reconcileEngine.runReconciliation(type, triggeredBy);
      return null;
    }
  }

  private async processJob(job: Job<ReconcileJobData>): Promise<void> {
    logger.info('Processing reconciliation job', {
      jobId: job.id,
      data: job.data
    });

    await reconcileEngine.runReconciliation(
      job.data.type,
      job.data.triggeredBy
    );
  }

  async getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    if (!this.queue) {
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0
      };
    }

    const counts = await this.queue.getJobCounts();

    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0
    };
  }

  async getRecentJobs(limit: number = 10): Promise<any[]> {
    if (!this.queue) {
      return [];
    }

    const completed = await this.queue.getCompleted(0, limit);
    const failed = await this.queue.getFailed(0, limit);

    const jobs = [...completed, ...failed]
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);

    return jobs.map(job => ({
      id: job.id,
      type: job.data.type,
      triggeredBy: job.data.triggeredBy,
      timestamp: job.data.timestamp,
      state: job.returnvalue ? 'completed' : 'failed',
      error: job.failedReason
    }));
  }

  async pauseQueue(): Promise<void> {
    if (this.queue) {
      await this.queue.pause();
      logger.info('Reconciliation queue paused');
    }
  }

  async resumeQueue(): Promise<void> {
    if (this.queue) {
      await this.queue.resume();
      logger.info('Reconciliation queue resumed');
    }
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      logger.info('Worker closed');
    }

    if (this.queue) {
      await this.queue.close();
      logger.info('Queue closed');
    }
  }
}

export const reconcileQueue = new ReconcileQueue();
