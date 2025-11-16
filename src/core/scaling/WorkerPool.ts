import { Worker, Queue, Job, WorkerOptions } from 'bullmq';
import { EventEmitter } from 'events';
import { createLogger } from '../logging/logger';
import { getConfig } from '../config/config';

const logger = createLogger({ module: 'WorkerPool' });

export interface WorkerPoolConfig {
  queueName: string;
  concurrency: number;
  maxJobs?: number;
  limiter?: {
    max: number;
    duration: number;
  };
}

export interface WorkerStats {
  workerId: string;
  processed: number;
  failed: number;
  active: number;
  waiting: number;
  delayed: number;
  completed: number;
  lastProcessedAt: Date | null;
}

export type JobHandler<T = any, R = any> = (job: Job<T>) => Promise<R>;

/**
 * Distributed Worker Pool using BullMQ
 * Manages multiple workers processing jobs from shared queues
 */
export class WorkerPool extends EventEmitter {
  private workers: Map<string, Worker> = new Map();
  private stats: Map<string, WorkerStats> = new Map();
  private queues: Map<string, Queue> = new Map();

  /**
   * Register a new worker for a queue
   */
  registerWorker<T = any, R = any>(
    config: WorkerPoolConfig,
    processor: JobHandler<T, R>
  ): Worker {
    const { queueName, concurrency, limiter } = config;

    if (this.workers.has(queueName)) {
      throw new Error(`Worker for queue "${queueName}" already registered`);
    }

    const redisConfig = getConfig().redis;

    const workerOptions: WorkerOptions = {
      connection: {
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db
      },
      concurrency,
      limiter
    };

    const worker = new Worker(
      queueName,
      async (job: Job<T>) => {
        const startTime = Date.now();

        try {
          logger.debug(`Processing job ${job.id} from queue ${queueName}`, {
            jobId: job.id,
            data: job.data
          });

          const result = await processor(job);

          const processingTime = Date.now() - startTime;

          logger.info(`Job ${job.id} completed`, {
            queueName,
            jobId: job.id,
            processingTime
          });

          this.updateStats(queueName, 'completed');

          return result;
        } catch (error) {
          const processingTime = Date.now() - startTime;

          logger.error(`Job ${job.id} failed`, {
            queueName,
            jobId: job.id,
            processingTime,
            error
          });

          this.updateStats(queueName, 'failed');

          throw error;
        }
      },
      workerOptions
    );

    this.setupWorkerHandlers(worker, queueName);

    this.workers.set(queueName, worker);

    // Initialize stats
    this.stats.set(queueName, {
      workerId: queueName,
      processed: 0,
      failed: 0,
      active: 0,
      waiting: 0,
      delayed: 0,
      completed: 0,
      lastProcessedAt: null
    });

    // Create queue instance for this worker
    const queue = new Queue(queueName, {
      connection: workerOptions.connection
    });

    this.queues.set(queueName, queue);

    logger.info(`Worker registered for queue: ${queueName}`, {
      concurrency,
      limiter
    });

    return worker;
  }

  /**
   * Setup event handlers for worker
   */
  private setupWorkerHandlers(worker: Worker, queueName: string): void {
    worker.on('completed', (job: Job) => {
      logger.debug(`Worker completed job ${job.id}`, { queueName });
      this.emit('jobCompleted', { queueName, jobId: job.id });
    });

    worker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error(`Worker failed job ${job?.id}`, {
        queueName,
        jobId: job?.id,
        error: error.message
      });
      this.emit('jobFailed', { queueName, jobId: job?.id, error });
    });

    worker.on('active', (job: Job) => {
      logger.debug(`Worker started processing job ${job.id}`, { queueName });
      this.stats.get(queueName)!.active++;
      this.emit('jobActive', { queueName, jobId: job.id });
    });

    worker.on('progress', (job: Job, progress: number | object) => {
      logger.debug(`Job ${job.id} progress`, {
        queueName,
        jobId: job.id,
        progress
      });
      this.emit('jobProgress', { queueName, jobId: job.id, progress });
    });

    worker.on('error', (error: Error) => {
      logger.error(`Worker error for queue ${queueName}`, error);
      this.emit('workerError', { queueName, error });
    });

    worker.on('ready', () => {
      logger.info(`Worker ready for queue ${queueName}`);
      this.emit('workerReady', queueName);
    });

    worker.on('stalled', (jobId: string) => {
      logger.warn(`Job ${jobId} stalled`, { queueName });
      this.emit('jobStalled', { queueName, jobId });
    });
  }

  /**
   * Update worker statistics
   */
  private updateStats(queueName: string, type: 'completed' | 'failed'): void {
    const stats = this.stats.get(queueName);
    if (!stats) return;

    stats.processed++;
    stats.lastProcessedAt = new Date();

    if (type === 'completed') {
      stats.completed++;
    } else {
      stats.failed++;
    }

    this.stats.set(queueName, stats);
  }

  /**
   * Get worker statistics
   */
  async getWorkerStats(queueName: string): Promise<WorkerStats | null> {
    const queue = this.queues.get(queueName);
    if (!queue) return null;

    const stats = this.stats.get(queueName);
    if (!stats) return null;

    // Get real-time queue counts
    const [active, waiting, delayed] = await Promise.all([
      queue.getActiveCount(),
      queue.getWaitingCount(),
      queue.getDelayedCount()
    ]);

    stats.active = active;
    stats.waiting = waiting;
    stats.delayed = delayed;

    return stats;
  }

  /**
   * Get statistics for all workers
   */
  async getAllWorkerStats(): Promise<WorkerStats[]> {
    const promises = Array.from(this.workers.keys()).map(queueName =>
      this.getWorkerStats(queueName)
    );

    const results = await Promise.all(promises);
    return results.filter((s): s is WorkerStats => s !== null);
  }

  /**
   * Pause a worker
   */
  async pauseWorker(queueName: string): Promise<void> {
    const worker = this.workers.get(queueName);
    if (!worker) {
      throw new Error(`Worker for queue "${queueName}" not found`);
    }

    await worker.pause();
    logger.info(`Worker paused for queue: ${queueName}`);
    this.emit('workerPaused', queueName);
  }

  /**
   * Resume a worker
   */
  async resumeWorker(queueName: string): Promise<void> {
    const worker = this.workers.get(queueName);
    if (!worker) {
      throw new Error(`Worker for queue "${queueName}" not found`);
    }

    await worker.resume();
    logger.info(`Worker resumed for queue: ${queueName}`);
    this.emit('workerResumed', queueName);
  }

  /**
   * Close a specific worker
   */
  async closeWorker(queueName: string): Promise<void> {
    const worker = this.workers.get(queueName);
    const queue = this.queues.get(queueName);

    if (worker) {
      await worker.close();
      this.workers.delete(queueName);
      logger.info(`Worker closed for queue: ${queueName}`);
    }

    if (queue) {
      await queue.close();
      this.queues.delete(queueName);
    }

    this.stats.delete(queueName);
    this.emit('workerClosed', queueName);
  }

  /**
   * Close all workers
   */
  async closeAll(): Promise<void> {
    logger.info('Closing all workers...');

    const closePromises: Promise<void>[] = [];

    for (const queueName of this.workers.keys()) {
      closePromises.push(this.closeWorker(queueName));
    }

    await Promise.all(closePromises);

    logger.info('All workers closed');
  }

  /**
   * Get worker instance
   */
  getWorker(queueName: string): Worker | undefined {
    return this.workers.get(queueName);
  }

  /**
   * Get queue instance
   */
  getQueue(queueName: string): Queue | undefined {
    return this.queues.get(queueName);
  }

  /**
   * Check if worker is registered
   */
  hasWorker(queueName: string): boolean {
    return this.workers.has(queueName);
  }

  /**
   * Get all registered queue names
   */
  getQueueNames(): string[] {
    return Array.from(this.workers.keys());
  }

  /**
   * Scale worker concurrency dynamically
   */
  async scaleWorker(queueName: string, concurrency: number): Promise<void> {
    const worker = this.workers.get(queueName);
    if (!worker) {
      throw new Error(`Worker for queue "${queueName}" not found`);
    }

    // BullMQ doesn't support dynamic concurrency change
    // We need to recreate the worker
    logger.warn(`Scaling worker requires recreation`, {
      queueName,
      newConcurrency: concurrency
    });

    // This would require storing the processor function
    // For now, just log the limitation
    logger.error('Dynamic worker scaling not yet implemented');
    throw new Error('Dynamic worker scaling requires worker recreation');
  }
}

// Singleton instance
let workerPool: WorkerPool | null = null;

export function getWorkerPool(): WorkerPool {
  if (!workerPool) {
    workerPool = new WorkerPool();
  }
  return workerPool;
}

export function createWorkerPool(): WorkerPool {
  return new WorkerPool();
}
