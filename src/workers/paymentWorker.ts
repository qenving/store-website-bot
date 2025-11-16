import { Job } from 'bullmq';
import { createLogger } from '../core/logging/logger';
import { getWorkerPool } from '../core/scaling/WorkerPool';
import { paymentManager } from '../core/payments/paymentManager';
import { transactionEngine } from '../core/transactions/TransactionEngine';
import { PaymentProvider } from '../core/payments/PaymentTypes';

const logger = createLogger({ module: 'PaymentWorker' });

export interface PaymentJobData {
  transactionId: string;
  provider: PaymentProvider;
  amount: number;
  currency: string;
  orderId: string;
  userId: string;
  metadata?: Record<string, any>;
}

export interface PaymentJobResult {
  success: boolean;
  transactionId: string;
  paymentId?: string;
  error?: string;
}

/**
 * Payment Processing Worker
 * Handles async payment processing jobs
 */
export async function processPaymentJob(job: Job<PaymentJobData>): Promise<PaymentJobResult> {
  const { transactionId, provider, amount, currency, orderId, userId, metadata } = job.data;

  logger.info(`Processing payment job`, {
    jobId: job.id,
    transactionId,
    provider,
    amount
  });

  try {
    // Update job progress
    await job.updateProgress(10);

    // Process payment through payment manager
    const result = await paymentManager.processPayment(provider, {
      amount,
      currency,
      orderId,
      userId,
      metadata
    });

    await job.updateProgress(50);

    if (result.success) {
      // Update transaction status
      await transactionEngine.updateTransactionStatus(
        transactionId,
        'completed',
        `Payment processed successfully via ${provider}`
      );

      await job.updateProgress(100);

      logger.info(`Payment job completed`, {
        jobId: job.id,
        transactionId,
        paymentId: result.paymentId
      });

      return {
        success: true,
        transactionId,
        paymentId: result.paymentId
      };
    } else {
      // Update transaction with error
      await transactionEngine.updateTransactionStatus(
        transactionId,
        'failed',
        `Payment failed: ${result.error}`
      );

      logger.error(`Payment job failed`, {
        jobId: job.id,
        transactionId,
        error: result.error
      });

      return {
        success: false,
        transactionId,
        error: result.error
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error(`Payment job error`, {
      jobId: job.id,
      transactionId,
      error: errorMessage
    });

    // Update transaction status
    await transactionEngine.updateTransactionStatus(
      transactionId,
      'failed',
      `Payment processing error: ${errorMessage}`
    );

    return {
      success: false,
      transactionId,
      error: errorMessage
    };
  }
}

/**
 * Initialize payment worker
 */
export function initializePaymentWorker(): void {
  const workerPool = getWorkerPool();

  workerPool.registerWorker(
    {
      queueName: 'payment-processing',
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000
      }
    },
    processPaymentJob
  );

  logger.info('Payment worker initialized');
}
