import { Server as SocketIOServer } from 'socket.io';
import { Mismatch, ReconcileProgress } from '../../core/reconciliation/types';
import { createLogger } from '../../core/logging/logger';

const logger = createLogger({ module: 'ReconcileEvents' });

export class ReconcileEvents {
  private io: SocketIOServer | null = null;

  setSocketServer(io: SocketIOServer): void {
    this.io = io;
    logger.info('Socket.io server registered for reconciliation events');
  }

  emitReconcileStart(data: {
    jobId: string;
    type: 'auto' | 'manual';
    triggeredBy?: string;
  }): void {
    if (!this.io) return;

    this.io.emit('reconcile:start', {
      jobId: data.jobId,
      type: data.type,
      triggeredBy: data.triggeredBy,
      timestamp: new Date().toISOString()
    });

    logger.info('Emitted reconcile:start event', { jobId: data.jobId });
  }

  emitReconcileProgress(progress: ReconcileProgress): void {
    if (!this.io) return;

    this.io.emit('reconcile:progress', {
      jobId: progress.jobId,
      total: progress.total,
      current: progress.current,
      percentage: progress.percentage,
      currentTransaction: progress.currentTransaction,
      status: progress.status,
      timestamp: new Date().toISOString()
    });

    // Only log every 10%
    if (progress.percentage % 10 === 0) {
      logger.info('Emitted reconcile:progress event', {
        jobId: progress.jobId,
        percentage: progress.percentage
      });
    }
  }

  emitReconcileComplete(data: {
    jobId: string;
    reportId: string;
    totalChecked: number;
    mismatchCount: number;
    duration: number;
  }): void {
    if (!this.io) return;

    this.io.emit('reconcile:complete', {
      jobId: data.jobId,
      reportId: data.reportId,
      totalChecked: data.totalChecked,
      mismatchCount: data.mismatchCount,
      duration: data.duration,
      timestamp: new Date().toISOString()
    });

    logger.info('Emitted reconcile:complete event', {
      jobId: data.jobId,
      mismatchCount: data.mismatchCount
    });
  }

  emitReconcileFailed(data: {
    jobId: string;
    error: string;
  }): void {
    if (!this.io) return;

    this.io.emit('reconcile:failed', {
      jobId: data.jobId,
      error: data.error,
      timestamp: new Date().toISOString()
    });

    logger.error('Emitted reconcile:failed event', {
      jobId: data.jobId,
      error: data.error
    });
  }

  emitMismatchDetected(mismatch: Mismatch): void {
    if (!this.io) return;

    this.io.emit('reconcile:mismatch', {
      id: mismatch.id,
      type: mismatch.type,
      severity: mismatch.severity,
      transactionId: mismatch.transactionId,
      orderId: mismatch.orderId,
      provider: mismatch.provider,
      localStatus: mismatch.localStatus,
      providerStatus: mismatch.providerStatus,
      localAmount: mismatch.localAmount,
      providerAmount: mismatch.providerAmount,
      currency: mismatch.currency,
      recommendedAction: mismatch.recommendedAction,
      timestamp: new Date().toISOString()
    });

    // Only log critical and high severity mismatches
    if (mismatch.severity === 'critical' || mismatch.severity === 'high') {
      logger.warn('Emitted reconcile:mismatch event', {
        mismatchId: mismatch.id,
        type: mismatch.type,
        severity: mismatch.severity
      });
    }
  }

  emitMismatchResolved(data: {
    mismatchId: string;
    resolvedBy: string;
    action: string;
    timestamp: Date;
  }): void {
    if (!this.io) return;

    this.io.emit('reconcile:mismatch_resolved', {
      mismatchId: data.mismatchId,
      resolvedBy: data.resolvedBy,
      action: data.action,
      timestamp: data.timestamp.toISOString()
    });

    logger.info('Emitted reconcile:mismatch_resolved event', {
      mismatchId: data.mismatchId,
      resolvedBy: data.resolvedBy
    });
  }

  emitReportGenerated(data: {
    reportId: string;
    date: string;
    mismatchCount: number;
  }): void {
    if (!this.io) return;

    this.io.emit('reconcile:report_generated', {
      reportId: data.reportId,
      date: data.date,
      mismatchCount: data.mismatchCount,
      timestamp: new Date().toISOString()
    });

    logger.info('Emitted reconcile:report_generated event', {
      reportId: data.reportId
    });
  }

  emitConfigUpdated(config: any): void {
    if (!this.io) return;

    this.io.emit('reconcile:config_updated', {
      config,
      timestamp: new Date().toISOString()
    });

    logger.info('Emitted reconcile:config_updated event');
  }
}

export const reconcileEvents = new ReconcileEvents();
