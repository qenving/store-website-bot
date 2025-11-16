import * as cron from 'node-cron';
import {
  ReconciliationReport,
  ReconcileJob,
  ReconcileStatus,
  ReconcileConfig,
  ReconcileProgress
} from './types';
import { ReconcileRules, DEFAULT_RECONCILE_CONFIG } from './reconcileRules';
import { mismatchDetector } from './mismatchDetector';
import { reconcileReporter } from './reconcileReporter';
import { dal } from '../db/dal';
import { paymentManager } from '../payments/paymentManager';
import { reconcileEvents } from '../../realtime/events/reconcileEvents';
import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'ReconcileEngine' });

export class ReconcileEngine {
  private config: ReconcileConfig;
  private cronJob: cron.ScheduledTask | null = null;
  private currentJob: ReconcileJob | null = null;
  private isRunning: boolean = false;

  constructor() {
    this.config = DEFAULT_RECONCILE_CONFIG;
  }

  async initialize(): Promise<void> {
    // Load config from database
    const savedConfig = await dal.settings.get('reconcile_config');
    if (savedConfig) {
      this.config = { ...DEFAULT_RECONCILE_CONFIG, ...savedConfig };
    }

    // Start cron job if enabled
    if (this.config.enabled) {
      this.startCronJob();
    }

    logger.info('Reconciliation engine initialized', { config: this.config });
  }

  startCronJob(): void {
    if (this.cronJob) {
      this.cronJob.stop();
    }

    this.cronJob = cron.schedule(this.config.cronSchedule, async () => {
      logger.info('Auto reconciliation triggered by cron');
      await this.runReconciliation('auto');
    });

    logger.info('Cron job started', { schedule: this.config.cronSchedule });
  }

  stopCronJob(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Cron job stopped');
    }
  }

  async runReconciliation(
    type: 'auto' | 'manual',
    triggeredBy?: string
  ): Promise<ReconciliationReport> {
    if (this.isRunning) {
      logger.warn('Reconciliation already running');
      throw new Error('Reconciliation already in progress');
    }

    this.isRunning = true;

    const job: ReconcileJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type,
      triggeredBy,
      scheduledAt: new Date(),
      startedAt: new Date(),
      status: ReconcileStatus.RUNNING
    };

    this.currentJob = job;

    const report: ReconciliationReport = {
      id: `report_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      runType: type,
      triggeredBy,
      startTime: new Date(),
      status: ReconcileStatus.RUNNING,
      totalTransactions: 0,
      checkedTransactions: 0,
      matchedTransactions: 0,
      mismatchCount: 0,
      mismatches: [],
      errorCount: 0,
      errors: [],
      summary: {
        byType: {} as any,
        bySeverity: {} as any,
        byProvider: {} as any
      }
    };

    try {
      logger.info('Reconciliation started', { jobId: job.id, type });

      // Emit start event
      reconcileEvents.emitReconcileStart({
        jobId: job.id,
        type,
        triggeredBy
      });

      // Step 1: Fetch all transactions to reconcile
      const transactions = await this.fetchTransactionsToReconcile();
      report.totalTransactions = transactions.length;

      logger.info('Fetched transactions for reconciliation', {
        count: transactions.length
      });

      // Step 2: Check for duplicate payments
      const duplicateMismatches = mismatchDetector.detectDuplicatePayments(transactions);
      report.mismatches.push(...duplicateMismatches);

      // Step 3: Process each transaction in batches
      const batches = this.createBatches(transactions, this.config.batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        await this.processBatch(batch, report);

        // Emit progress event
        const progress: ReconcileProgress = {
          jobId: job.id,
          total: report.totalTransactions,
          current: report.checkedTransactions,
          percentage: Math.round((report.checkedTransactions / report.totalTransactions) * 100),
          status: `Processing batch ${i + 1}/${batches.length}`
        };

        reconcileEvents.emitReconcileProgress(progress);
      }

      // Step 4: Calculate summary
      report.summary = reconcileReporter.generateSummary(report.mismatches);
      report.mismatchCount = report.mismatches.length;
      report.matchedTransactions = report.checkedTransactions - report.mismatchCount;
      report.endTime = new Date();
      report.status = ReconcileStatus.COMPLETED;

      // Save report
      await reconcileReporter.saveReport(report);

      // Update job status
      job.completedAt = new Date();
      job.status = ReconcileStatus.COMPLETED;
      job.reportId = report.id;

      // Emit completion event
      reconcileEvents.emitReconcileComplete({
        jobId: job.id,
        reportId: report.id,
        totalChecked: report.checkedTransactions,
        mismatchCount: report.mismatchCount,
        duration: report.endTime.getTime() - report.startTime.getTime()
      });

      // Emit mismatch detected events
      for (const mismatch of report.mismatches) {
        reconcileEvents.emitMismatchDetected(mismatch);
      }

      logger.info('Reconciliation completed', {
        jobId: job.id,
        totalChecked: report.checkedTransactions,
        mismatches: report.mismatchCount,
        errors: report.errorCount
      });

      return report;
    } catch (error) {
      logger.error('Reconciliation failed', error);

      report.status = ReconcileStatus.FAILED;
      report.endTime = new Date();

      job.status = ReconcileStatus.FAILED;
      job.completedAt = new Date();
      job.error = error instanceof Error ? error.message : 'Unknown error';

      // Save failed report
      await reconcileReporter.saveReport(report);

      throw error;
    } finally {
      this.isRunning = false;
      this.currentJob = null;
    }
  }

  private async fetchTransactionsToReconcile(): Promise<any[]> {
    const allTransactions = await dal.transactions.list();

    // Filter transactions based on reconciliation rules
    const filtered = allTransactions.filter(tx =>
      ReconcileRules.shouldReconcileTransaction(tx, this.config)
    );

    return filtered;
  }

  private async processBatch(
    transactions: any[],
    report: ReconciliationReport
  ): Promise<void> {
    const promises = transactions.map(async (transaction) => {
      try {
        report.checkedTransactions++;

        // Fetch payment status from provider
        const providerStatus = await paymentManager.getPaymentStatus(
          transaction.provider,
          transaction.paymentId
        );

        // Detect mismatches
        const mismatches = mismatchDetector.detectMismatches(
          transaction,
          providerStatus
        );

        if (mismatches.length > 0) {
          report.mismatches.push(...mismatches);
        }
      } catch (error) {
        logger.error('Failed to check transaction', {
          transactionId: transaction.id,
          error
        });

        report.errorCount++;
        report.errors.push({
          transactionId: transaction.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date()
        });
      }
    });

    // Process with concurrency limit
    const chunks = this.createBatches(promises, this.config.maxConcurrency);

    for (const chunk of chunks) {
      await Promise.all(chunk);
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    return batches;
  }

  async updateConfig(newConfig: Partial<ReconcileConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };

    await dal.settings.set('reconcile_config', this.config);

    // Restart cron job if schedule changed
    if (newConfig.cronSchedule || newConfig.enabled !== undefined) {
      if (this.config.enabled) {
        this.startCronJob();
      } else {
        this.stopCronJob();
      }
    }

    logger.info('Reconciliation config updated', { config: this.config });
  }

  getConfig(): ReconcileConfig {
    return { ...this.config };
  }

  getCurrentJob(): ReconcileJob | null {
    return this.currentJob ? { ...this.currentJob } : null;
  }

  isReconciliationRunning(): boolean {
    return this.isRunning;
  }
}

export const reconcileEngine = new ReconcileEngine();
