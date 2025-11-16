import { MismatchType, ReconcileConfig } from './types';
import { UnifiedPaymentStatus } from '../payments/paymentTypes';

export const DEFAULT_RECONCILE_CONFIG: ReconcileConfig = {
  enabled: true,
  cronSchedule: '0 3 * * *', // Daily at 03:00 AM
  batchSize: 50,
  maxConcurrency: 5,
  lookbackDays: 7,
  excludeStatuses: [UnifiedPaymentStatus.REFUNDED],
  retryFailedChecks: true,
  maxRetries: 3,
  notifyOnMismatch: true,
  criticalThreshold: 5
};

export const MISMATCH_SEVERITY_RULES: Record<MismatchType, (data: any) => 'low' | 'medium' | 'high' | 'critical'> = {
  [MismatchType.STATUS_MISMATCH]: (data) => {
    const { localStatus, providerStatus } = data;

    // Critical: Local says paid but provider says failed/cancelled
    if (localStatus === UnifiedPaymentStatus.PAID &&
        (providerStatus === UnifiedPaymentStatus.FAILED ||
         providerStatus === UnifiedPaymentStatus.CANCELLED)) {
      return 'critical';
    }

    // High: Provider says paid but local doesn't
    if (providerStatus === UnifiedPaymentStatus.PAID &&
        localStatus !== UnifiedPaymentStatus.PAID) {
      return 'high';
    }

    // Medium: Status discrepancy in non-final states
    if (localStatus === UnifiedPaymentStatus.PENDING ||
        localStatus === UnifiedPaymentStatus.PROCESSING) {
      return 'medium';
    }

    return 'low';
  },

  [MismatchType.AMOUNT_MISMATCH]: (data) => {
    const { localAmount, providerAmount } = data;
    const diff = Math.abs(localAmount - providerAmount);
    const percentage = (diff / localAmount) * 100;

    if (percentage > 10) return 'critical';
    if (percentage > 5) return 'high';
    if (percentage > 1) return 'medium';
    return 'low';
  },

  [MismatchType.MISSING_LOCAL]: () => 'critical',
  [MismatchType.MISSING_PROVIDER]: () => 'high',
  [MismatchType.DUPLICATE_PAYMENT]: () => 'critical',
  [MismatchType.PROVIDER_ERROR]: () => 'medium'
};

export const RECOMMENDED_ACTIONS: Record<MismatchType, (data: any) => string> = {
  [MismatchType.STATUS_MISMATCH]: (data) => {
    const { localStatus, providerStatus } = data;

    if (providerStatus === UnifiedPaymentStatus.PAID &&
        localStatus !== UnifiedPaymentStatus.PAID) {
      return 'Sync from provider - mark transaction as PAID and process order';
    }

    if (localStatus === UnifiedPaymentStatus.PAID &&
        (providerStatus === UnifiedPaymentStatus.FAILED ||
         providerStatus === UnifiedPaymentStatus.CANCELLED)) {
      return 'URGENT: Manual review required - refund user balance if order not delivered';
    }

    if (providerStatus === UnifiedPaymentStatus.EXPIRED &&
        localStatus === UnifiedPaymentStatus.PENDING) {
      return 'Sync from provider - mark transaction as EXPIRED';
    }

    if (providerStatus === UnifiedPaymentStatus.CANCELLED &&
        localStatus === UnifiedPaymentStatus.PENDING) {
      return 'Sync from provider - mark transaction as CANCELLED';
    }

    return 'Manual review - verify correct status with payment provider';
  },

  [MismatchType.AMOUNT_MISMATCH]: (data) => {
    const { localAmount, providerAmount } = data;
    const diff = Math.abs(localAmount - providerAmount);

    if (diff > 1000) {
      return 'CRITICAL: Manual investigation - significant amount discrepancy detected';
    }

    return 'Verify transaction details - check for currency conversion issues or rounding errors';
  },

  [MismatchType.MISSING_LOCAL]: () => {
    return 'Create local transaction record from provider data - possible webhook failure';
  },

  [MismatchType.MISSING_PROVIDER]: () => {
    return 'Verify transaction exists at provider - may indicate fraudulent/test transaction';
  },

  [MismatchType.DUPLICATE_PAYMENT]: () => {
    return 'CRITICAL: Check for duplicate order processing - refund duplicate payment';
  },

  [MismatchType.PROVIDER_ERROR]: () => {
    return 'Retry status check later - temporary provider API error';
  }
};

export class ReconcileRules {
  static shouldReconcileTransaction(transaction: any, config: ReconcileConfig): boolean {
    // Skip if status is excluded
    if (config.excludeStatuses.includes(transaction.status)) {
      return false;
    }

    // Skip if transaction is too old
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.lookbackDays);

    if (new Date(transaction.createdAt) < cutoffDate) {
      return false;
    }

    // Only reconcile transactions that have a payment ID
    if (!transaction.paymentId) {
      return false;
    }

    return true;
  }

  static getSeverity(type: MismatchType, data: any): 'low' | 'medium' | 'high' | 'critical' {
    const rule = MISMATCH_SEVERITY_RULES[type];
    return rule ? rule(data) : 'medium';
  }

  static getRecommendedAction(type: MismatchType, data: any): string {
    const rule = RECOMMENDED_ACTIONS[type];
    return rule ? rule(data) : 'Manual review required';
  }

  static isCriticalMismatch(type: MismatchType, data: any): boolean {
    return this.getSeverity(type, data) === 'critical';
  }
}
