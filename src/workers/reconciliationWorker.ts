import { Job } from 'bullmq';
import { createLogger } from '../core/logging/logger';
import { getWorkerPool } from '../core/scaling/WorkerPool';
import { reconciliationEngine } from '../core/reconciliation/ReconciliationEngine';

const logger = createLogger({ module: 'ReconciliationWorker' });

export interface ReconciliationJobData {
  provider: string;
  startDate: string;
  endDate: string;
  batchSize?: number;
}

export interface ReconciliationJobResult {
  success: boolean;
  provider: string;
  processedTransactions: number;
  discrepancies: number;
  error?: string;
}

/**
 * Reconciliation Worker
 * Handles async reconciliation jobs
 */
export async function processReconciliationJob(job: Job<ReconciliationJobData>): Promise<ReconciliationJobResult> {
  const { provider, startDate, endDate, batchSize = 100 } = job.data;

  logger.info(`Processing reconciliation job`, {
    jobId: job.id,
    provider,
    startDate,
    endDate
  });

  try {
    await job.updateProgress(10);

    const result = await reconciliationEngine.reconcile(provider, {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      batchSize
    });

    await job.updateProgress(100);

    logger.info(`Reconciliation job completed`, {
      jobId: job.id,
      provider,
      processedTransactions: result.processedCount,
      discrepancies: result.discrepancies.length
    });

    return {
      success: true,
      provider,
      processedTransactions: result.processedCount,
      discrepancies: result.discrepancies.length
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error(`Reconciliation job error`, {
      jobId: job.id,
      provider,
      error: errorMessage
    });

    return {
      success: false,
      provider,
      processedTransactions: 0,
      discrepancies: 0,
      error: errorMessage
    };
  }
}

/**
 * Initialize reconciliation worker
 */
export function initializeReconciliationWorker(): void {
  const workerPool = getWorkerPool();

  workerPool.registerWorker(
    {
      queueName: 'reconciliation',
      concurrency: 2,
      limiter: {
        max: 5,
        duration: 60000
      }
    },
    processReconciliationJob
  );

  logger.info('Reconciliation worker initialized');
}
