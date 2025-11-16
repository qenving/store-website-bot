import { Mismatch, MismatchType, MismatchResolution } from './types';
import { UnifiedPaymentStatus } from '../payments/paymentTypes';
import { dal } from '../db/dal';
import { transactionEngine } from '../transactions/TransactionEngine';
import { auditLogger, AuditAction } from '../audit/auditLogger';
import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'MismatchResolver' });

export class MismatchResolver {
  async resolveMismatch(
    mismatch: Mismatch,
    action: MismatchResolution['action'],
    adminId: string,
    adminUsername: string,
    notes: string
  ): Promise<boolean> {
    try {
      logger.info('Resolving mismatch', {
        mismatchId: mismatch.id,
        action,
        adminId
      });

      let success = false;

      switch (action) {
        case 'sync_from_provider':
          success = await this.syncFromProvider(mismatch);
          break;

        case 'force_local_status':
          success = await this.forceLocalStatus(mismatch, notes);
          break;

        case 'mark_as_valid':
          success = await this.markAsValid(mismatch);
          break;

        case 'manual_review':
          success = await this.flagForManualReview(mismatch);
          break;

        case 'refund':
          success = await this.processRefund(mismatch, adminId, adminUsername);
          break;

        case 'cancel':
          success = await this.cancelTransaction(mismatch, adminId, adminUsername);
          break;

        default:
          logger.error('Unknown resolution action', { action });
          return false;
      }

      if (success) {
        // Mark mismatch as resolved
        mismatch.resolved = true;
        mismatch.resolvedAt = new Date();
        mismatch.resolvedBy = adminUsername;
        mismatch.resolverNotes = notes;

        // Save resolution to database
        await dal.settings.set(`mismatch_${mismatch.id}`, mismatch);

        // Log to audit
        await auditLogger.log({
          action: AuditAction.RECONCILIATION_RUN,
          adminId,
          adminUsername,
          targetType: 'mismatch',
          targetId: mismatch.id,
          metadata: {
            type: mismatch.type,
            action,
            transactionId: mismatch.transactionId,
            notes
          }
        });

        logger.info('Mismatch resolved successfully', {
          mismatchId: mismatch.id,
          action
        });
      }

      return success;
    } catch (error) {
      logger.error('Failed to resolve mismatch', error);
      return false;
    }
  }

  private async syncFromProvider(mismatch: Mismatch): Promise<boolean> {
    if (!mismatch.providerStatus) {
      logger.error('Cannot sync from provider - no provider status');
      return false;
    }

    try {
      const transaction = await dal.transactions.get(mismatch.transactionId);
      if (!transaction) {
        logger.error('Transaction not found', { id: mismatch.transactionId });
        return false;
      }

      // Update transaction status to match provider
      const newStatus = mismatch.providerStatus as UnifiedPaymentStatus;
      transaction.status = newStatus;
      transaction.updatedAt = new Date();
      transaction.metadata = {
        ...transaction.metadata,
        reconciledAt: new Date().toISOString(),
        previousStatus: mismatch.localStatus,
        syncedFromProvider: true
      };

      await dal.transactions.update(transaction.id, transaction);

      // If provider says paid, process the order
      if (newStatus === UnifiedPaymentStatus.PAID) {
        await transactionEngine.processSuccessfulPayment(transaction.id);
      }

      logger.info('Transaction synced from provider', {
        transactionId: transaction.id,
        oldStatus: mismatch.localStatus,
        newStatus
      });

      return true;
    } catch (error) {
      logger.error('Failed to sync from provider', error);
      return false;
    }
  }

  private async forceLocalStatus(mismatch: Mismatch, notes: string): Promise<boolean> {
    try {
      const transaction = await dal.transactions.get(mismatch.transactionId);
      if (!transaction) {
        logger.error('Transaction not found', { id: mismatch.transactionId });
        return false;
      }

      // Force update with notes explaining why
      transaction.metadata = {
        ...transaction.metadata,
        reconciledAt: new Date().toISOString(),
        forcedStatus: true,
        forcedReason: notes
      };

      await dal.transactions.update(transaction.id, transaction);

      logger.info('Local status forced', {
        transactionId: transaction.id,
        status: transaction.status
      });

      return true;
    } catch (error) {
      logger.error('Failed to force local status', error);
      return false;
    }
  }

  private async markAsValid(mismatch: Mismatch): Promise<boolean> {
    try {
      // Just mark as resolved without changing anything
      // This is for cases where the mismatch is explainable/acceptable
      logger.info('Mismatch marked as valid', {
        mismatchId: mismatch.id,
        type: mismatch.type
      });

      return true;
    } catch (error) {
      logger.error('Failed to mark as valid', error);
      return false;
    }
  }

  private async flagForManualReview(mismatch: Mismatch): Promise<boolean> {
    try {
      const transaction = await dal.transactions.get(mismatch.transactionId);
      if (!transaction) {
        logger.error('Transaction not found', { id: mismatch.transactionId });
        return false;
      }

      transaction.metadata = {
        ...transaction.metadata,
        flaggedForReview: true,
        flaggedAt: new Date().toISOString(),
        flagReason: mismatch.recommendedAction
      };

      await dal.transactions.update(transaction.id, transaction);

      logger.info('Transaction flagged for manual review', {
        transactionId: transaction.id
      });

      return true;
    } catch (error) {
      logger.error('Failed to flag for manual review', error);
      return false;
    }
  }

  private async processRefund(
    mismatch: Mismatch,
    adminId: string,
    adminUsername: string
  ): Promise<boolean> {
    try {
      const transaction = await dal.transactions.get(mismatch.transactionId);
      if (!transaction) {
        logger.error('Transaction not found', { id: mismatch.transactionId });
        return false;
      }

      // Use transaction engine to process refund
      const result = await transactionEngine.refundTransaction(
        transaction.id,
        'Refunded due to reconciliation mismatch'
      );

      if (result.success) {
        await auditLogger.log({
          action: AuditAction.TRANSACTION_REFUND,
          adminId,
          adminUsername,
          targetType: 'transaction',
          targetId: transaction.id,
          metadata: {
            amount: transaction.amount,
            currency: transaction.currency,
            reason: 'reconciliation_mismatch',
            mismatchId: mismatch.id
          }
        });

        logger.info('Refund processed due to mismatch', {
          transactionId: transaction.id,
          mismatchId: mismatch.id
        });

        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to process refund', error);
      return false;
    }
  }

  private async cancelTransaction(
    mismatch: Mismatch,
    adminId: string,
    adminUsername: string
  ): Promise<boolean> {
    try {
      const transaction = await dal.transactions.get(mismatch.transactionId);
      if (!transaction) {
        logger.error('Transaction not found', { id: mismatch.transactionId });
        return false;
      }

      transaction.status = UnifiedPaymentStatus.CANCELLED;
      transaction.updatedAt = new Date();
      transaction.metadata = {
        ...transaction.metadata,
        cancelledAt: new Date().toISOString(),
        cancelledBy: adminUsername,
        cancelReason: 'reconciliation_mismatch'
      };

      await dal.transactions.update(transaction.id, transaction);

      await auditLogger.log({
        action: AuditAction.TRANSACTION_MARK_FAILED,
        adminId,
        adminUsername,
        targetType: 'transaction',
        targetId: transaction.id,
        metadata: {
          reason: 'reconciliation_mismatch',
          mismatchId: mismatch.id
        }
      });

      logger.info('Transaction cancelled due to mismatch', {
        transactionId: transaction.id,
        mismatchId: mismatch.id
      });

      return true;
    } catch (error) {
      logger.error('Failed to cancel transaction', error);
      return false;
    }
  }

  async batchResolve(
    mismatches: Mismatch[],
    action: MismatchResolution['action'],
    adminId: string,
    adminUsername: string,
    notes: string
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const mismatch of mismatches) {
      const resolved = await this.resolveMismatch(
        mismatch,
        action,
        adminId,
        adminUsername,
        notes
      );

      if (resolved) {
        success++;
      } else {
        failed++;
      }
    }

    logger.info('Batch resolve completed', { success, failed });

    return { success, failed };
  }
}

export const mismatchResolver = new MismatchResolver();
