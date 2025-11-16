import * as cluster from 'cluster';
import * as os from 'os';
import { EventEmitter } from 'events';
import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'ClusterManager' });

export interface ClusterConfig {
  workers: number | 'auto';
  respawn: boolean;
  maxRestarts: number;
  restartWindow: number; // Time window in ms for counting restarts
  execArgv?: string[];
}

export interface WorkerInfo {
  id: number;
  pid: number;
  status: 'online' | 'listening' | 'disconnected' | 'dead';
  restarts: number;
  lastRestart: Date | null;
  uptime: number;
  memory: number;
}

/**
 * Cluster Manager for multi-process scaling
 * Manages worker processes for API, Website, and other services
 */
export class ClusterManager extends EventEmitter {
  private config: ClusterConfig;
  private workers: Map<number, WorkerInfo> = new Map();
  private restartCounts: Map<number, { count: number; firstRestart: number }> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: ClusterConfig) {
    super();
    this.config = config;
  }

  /**
   * Initialize cluster and fork workers
   */
  async initialize(): Promise<void> {
    if (!cluster.isPrimary) {
      throw new Error('ClusterManager can only run in primary process');
    }

    const workerCount = this.config.workers === 'auto'
      ? os.cpus().length
      : this.config.workers;

    logger.info('Starting cluster manager', {
      workerCount,
      cpus: os.cpus().length
    });

    this.setupMasterHandlers();

    // Fork workers
    for (let i = 0; i < workerCount; i++) {
      this.forkWorker();
    }

    // Start health monitoring
    this.startHealthMonitoring();

    logger.info(`Cluster initialized with ${workerCount} workers`);
  }

  /**
   * Setup event handlers for master process
   */
  private setupMasterHandlers(): void {
    cluster.on('fork', (worker) => {
      logger.info(`Worker ${worker.id} forked`, { pid: worker.process.pid });

      this.workers.set(worker.id, {
        id: worker.id,
        pid: worker.process.pid!,
        status: 'online',
        restarts: 0,
        lastRestart: null,
        uptime: Date.now(),
        memory: 0
      });

      this.emit('workerFork', worker.id);
    });

    cluster.on('online', (worker) => {
      logger.info(`Worker ${worker.id} online`, { pid: worker.process.pid });
      this.updateWorkerStatus(worker.id, 'online');
      this.emit('workerOnline', worker.id);
    });

    cluster.on('listening', (worker, address) => {
      logger.info(`Worker ${worker.id} listening`, {
        pid: worker.process.pid,
        address: address.address,
        port: address.port
      });
      this.updateWorkerStatus(worker.id, 'listening');
      this.emit('workerListening', { workerId: worker.id, address });
    });

    cluster.on('disconnect', (worker) => {
      logger.warn(`Worker ${worker.id} disconnected`, { pid: worker.process.pid });
      this.updateWorkerStatus(worker.id, 'disconnected');
      this.emit('workerDisconnect', worker.id);
    });

    cluster.on('exit', (worker, code, signal) => {
      logger.error(`Worker ${worker.id} died`, {
        pid: worker.process.pid,
        code,
        signal
      });

      this.updateWorkerStatus(worker.id, 'dead');
      this.emit('workerExit', { workerId: worker.id, code, signal });

      // Handle respawn
      if (this.config.respawn && !worker.exitedAfterDisconnect) {
        const shouldRespawn = this.checkRespawnLimit(worker.id);

        if (shouldRespawn) {
          logger.info(`Respawning worker ${worker.id}...`);
          setTimeout(() => {
            this.forkWorker();
          }, 1000);
        } else {
          logger.error(`Worker ${worker.id} exceeded max restarts, not respawning`);
          this.emit('workerMaxRestarts', worker.id);
        }
      }

      // Cleanup worker info
      this.workers.delete(worker.id);
    });

    cluster.on('message', (worker, message) => {
      this.emit('workerMessage', { workerId: worker.id, message });
    });
  }

  /**
   * Check if worker can be respawned based on restart limits
   */
  private checkRespawnLimit(workerId: number): boolean {
    const now = Date.now();
    const restartData = this.restartCounts.get(workerId);

    if (!restartData) {
      this.restartCounts.set(workerId, { count: 1, firstRestart: now });
      return true;
    }

    // Reset counter if outside time window
    if (now - restartData.firstRestart > this.config.restartWindow) {
      this.restartCounts.set(workerId, { count: 1, firstRestart: now });
      return true;
    }

    // Check if max restarts exceeded
    if (restartData.count >= this.config.maxRestarts) {
      return false;
    }

    // Increment restart count
    restartData.count++;
    this.restartCounts.set(workerId, restartData);
    return true;
  }

  /**
   * Fork a new worker
   */
  private forkWorker(): cluster.Worker {
    const worker = cluster.fork({
      ...process.env,
      WORKER_ID: String(Object.keys(cluster.workers || {}).length + 1)
    });

    return worker;
  }

  /**
   * Update worker status
   */
  private updateWorkerStatus(workerId: number, status: WorkerInfo['status']): void {
    const info = this.workers.get(workerId);
    if (info) {
      info.status = status;
      this.workers.set(workerId, info);
    }
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.updateWorkerStats();
    }, 10000); // Every 10 seconds
  }

  /**
   * Update worker statistics
   */
  private updateWorkerStats(): void {
    for (const [workerId, info] of this.workers.entries()) {
      const worker = cluster.workers?.[workerId];

      if (worker && worker.isConnected()) {
        // Request memory usage from worker
        worker.send({ type: 'stats:request' });

        // Update uptime
        info.uptime = Date.now() - info.uptime;
      }
    }
  }

  /**
   * Get all worker info
   */
  getAllWorkers(): WorkerInfo[] {
    return Array.from(this.workers.values());
  }

  /**
   * Get specific worker info
   */
  getWorker(workerId: number): WorkerInfo | undefined {
    return this.workers.get(workerId);
  }

  /**
   * Send message to all workers
   */
  broadcast(message: any): void {
    for (const worker of Object.values(cluster.workers || {})) {
      if (worker && worker.isConnected()) {
        worker.send(message);
      }
    }

    logger.debug('Message broadcasted to all workers', { message });
  }

  /**
   * Send message to specific worker
   */
  sendToWorker(workerId: number, message: any): void {
    const worker = cluster.workers?.[workerId];

    if (worker && worker.isConnected()) {
      worker.send(message);
      logger.debug(`Message sent to worker ${workerId}`, { message });
    } else {
      logger.warn(`Cannot send message to worker ${workerId}: not connected`);
    }
  }

  /**
   * Gracefully restart a specific worker
   */
  async restartWorker(workerId: number): Promise<void> {
    const worker = cluster.workers?.[workerId];

    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }

    logger.info(`Restarting worker ${workerId}...`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Worker ${workerId} restart timeout`));
      }, 30000);

      const newWorker = this.forkWorker();

      newWorker.once('listening', () => {
        clearTimeout(timeout);
        worker.disconnect();

        setTimeout(() => {
          if (!worker.isDead()) {
            worker.kill();
          }
          resolve();
        }, 1000);
      });
    });
  }

  /**
   * Gracefully restart all workers sequentially
   */
  async restartAllWorkers(delay: number = 2000): Promise<void> {
    const workerIds = Object.keys(cluster.workers || {}).map(Number);

    logger.info('Restarting all workers...', {
      count: workerIds.length,
      delay
    });

    for (const workerId of workerIds) {
      await this.restartWorker(workerId);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    logger.info('All workers restarted successfully');
  }

  /**
   * Kill a specific worker
   */
  killWorker(workerId: number, signal: NodeJS.Signals = 'SIGTERM'): void {
    const worker = cluster.workers?.[workerId];

    if (worker) {
      logger.info(`Killing worker ${workerId}`, { signal });
      worker.kill(signal);
    } else {
      logger.warn(`Worker ${workerId} not found`);
    }
  }

  /**
   * Shutdown cluster gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down cluster...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Disconnect all workers
    const disconnectPromises = Object.values(cluster.workers || {}).map((worker) => {
      return new Promise<void>((resolve) => {
        if (!worker) {
          resolve();
          return;
        }

        worker.once('disconnect', () => resolve());
        worker.disconnect();

        // Force kill after 5 seconds
        setTimeout(() => {
          if (!worker.isDead()) {
            worker.kill();
          }
          resolve();
        }, 5000);
      });
    });

    await Promise.all(disconnectPromises);

    logger.info('Cluster shut down successfully');
  }

  /**
   * Get cluster statistics
   */
  getClusterStats() {
    const workers = this.getAllWorkers();

    return {
      totalWorkers: workers.length,
      onlineWorkers: workers.filter(w => w.status === 'online' || w.status === 'listening').length,
      deadWorkers: workers.filter(w => w.status === 'dead').length,
      totalMemory: workers.reduce((acc, w) => acc + w.memory, 0),
      averageUptime: workers.reduce((acc, w) => acc + w.uptime, 0) / workers.length || 0
    };
  }
}

/**
 * Setup worker process handlers
 */
export function setupWorkerHandlers(): void {
  if (cluster.isPrimary) {
    logger.warn('setupWorkerHandlers called in primary process');
    return;
  }

  // Handle stats requests from master
  process.on('message', (msg: any) => {
    if (msg.type === 'stats:request') {
      const memoryUsage = process.memoryUsage();

      process.send!({
        type: 'stats:response',
        workerId: cluster.worker!.id,
        memory: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        uptime: process.uptime()
      });
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Worker received SIGTERM, shutting down gracefully...');

    // Give worker time to finish current requests
    setTimeout(() => {
      process.exit(0);
    }, 5000);
  });

  logger.info(`Worker ${cluster.worker!.id} handlers setup complete`, {
    pid: process.pid
  });
}
