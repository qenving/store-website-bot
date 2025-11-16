import { Job } from 'bullmq';
import { createLogger } from '../core/logging/logger';
import { getWorkerPool } from '../core/scaling/WorkerPool';
import { alertService } from '../core/monitoring/alertService';

const logger = createLogger({ module: 'NotificationWorker' });

export interface NotificationJobData {
  type: 'email' | 'discord' | 'slack';
  recipient: string;
  subject?: string;
  message: string;
  metadata?: Record<string, any>;
}

export async function processNotificationJob(job: Job<NotificationJobData>): Promise<{ success: boolean }> {
  const { type, recipient, subject, message, metadata } = job.data;

  logger.info(`Processing notification job`, {
    jobId: job.id,
    type,
    recipient
  });

  try {
    await job.updateProgress(50);

    await alertService.sendAlert({
      title: subject || 'Notification',
      message,
      severity: 'info',
      source: 'NotificationWorker',
      metadata
    });

    await job.updateProgress(100);

    logger.info(`Notification job completed`, { jobId: job.id });

    return { success: true };
  } catch (error) {
    logger.error(`Notification job error`, { jobId: job.id, error });
    throw error;
  }
}

export function initializeNotificationWorker(): void {
  const workerPool = getWorkerPool();

  workerPool.registerWorker(
    {
      queueName: 'notifications',
      concurrency: 10
    },
    processNotificationJob
  );

  logger.info('Notification worker initialized');
}
