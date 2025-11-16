import { Mismatch, MismatchType } from './types';
import { ReconcileRules } from './reconcileRules';
import { UnifiedPaymentStatus } from '../payments/paymentTypes';
import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'MismatchDetector' });

export class MismatchDetector {
  detectMismatches(
    localTransaction: any,
    providerData: any | null
  ): Mismatch[] {
    const mismatches: Mismatch[] = [];

    // Type 1: MISSING_PROVIDER - Local exists but provider returns null/error
    if (!providerData || providerData.error) {
      mismatches.push(this.createMismatch({
        type: MismatchType.MISSING_PROVIDER,
        transactionId: localTransaction.id,
        orderId: localTransaction.orderId,
        localStatus: localTransaction.status,
        providerStatus: null,
        localAmount: localTransaction.amount,
        providerAmount: null,
        currency: localTransaction.currency,
        provider: localTransaction.provider,
        metadata: { providerError: providerData?.error }
      }));

      return mismatches;
    }

    // Type 2: STATUS_MISMATCH - Status differs between local and provider
    if (localTransaction.status !== providerData.status) {
      mismatches.push(this.createMismatch({
        type: MismatchType.STATUS_MISMATCH,
        transactionId: localTransaction.id,
        orderId: localTransaction.orderId,
        localStatus: localTransaction.status,
        providerStatus: providerData.status,
        localAmount: localTransaction.amount,
        providerAmount: providerData.amount,
        currency: localTransaction.currency,
        provider: localTransaction.provider,
        metadata: {
          localStatusCode: localTransaction.status,
          providerStatusCode: providerData.providerStatus
        }
      }));
    }

    // Type 3: AMOUNT_MISMATCH - Amount differs (allow 1% tolerance for rounding)
    const amountDiff = Math.abs(localTransaction.amount - providerData.amount);
    const tolerance = localTransaction.amount * 0.01;

    if (amountDiff > tolerance) {
      mismatches.push(this.createMismatch({
        type: MismatchType.AMOUNT_MISMATCH,
        transactionId: localTransaction.id,
        orderId: localTransaction.orderId,
        localStatus: localTransaction.status,
        providerStatus: providerData.status,
        localAmount: localTransaction.amount,
        providerAmount: providerData.amount,
        currency: localTransaction.currency,
        provider: localTransaction.provider,
        metadata: {
          difference: amountDiff,
          percentageDiff: (amountDiff / localTransaction.amount) * 100
        }
      }));
    }

    // Type 4: DUPLICATE_PAYMENT - Multiple local transactions with same paymentId
    // This is checked at a higher level in the engine

    return mismatches;
  }

  detectDuplicatePayments(transactions: any[]): Mismatch[] {
    const mismatches: Mismatch[] = [];
    const paymentIdMap = new Map<string, any[]>();

    // Group transactions by paymentId
    for (const tx of transactions) {
      if (!tx.paymentId) continue;

      if (!paymentIdMap.has(tx.paymentId)) {
        paymentIdMap.set(tx.paymentId, []);
      }
      paymentIdMap.get(tx.paymentId)!.push(tx);
    }

    // Detect duplicates
    for (const [paymentId, txList] of paymentIdMap.entries()) {
      if (txList.length > 1) {
        // Create a mismatch for each duplicate transaction
        for (const tx of txList) {
          mismatches.push(this.createMismatch({
            type: MismatchType.DUPLICATE_PAYMENT,
            transactionId: tx.id,
            orderId: tx.orderId,
            localStatus: tx.status,
            providerStatus: null,
            localAmount: tx.amount,
            providerAmount: null,
            currency: tx.currency,
            provider: tx.provider,
            metadata: {
              paymentId,
              duplicateCount: txList.length,
              duplicateIds: txList.map(t => t.id)
            }
          }));
        }
      }
    }

    return mismatches;
  }

  detectMissingLocal(
    providerTransactions: any[],
    localTransactionIds: Set<string>
  ): Mismatch[] {
    const mismatches: Mismatch[] = [];

    for (const providerTx of providerTransactions) {
      if (!localTransactionIds.has(providerTx.paymentId)) {
        mismatches.push(this.createMismatch({
          type: MismatchType.MISSING_LOCAL,
          transactionId: providerTx.paymentId,
          orderId: providerTx.orderId || providerTx.paymentId,
          localStatus: UnifiedPaymentStatus.PENDING,
          providerStatus: providerTx.status,
          localAmount: 0,
          providerAmount: providerTx.amount,
          currency: providerTx.currency || 'IDR',
          provider: providerTx.provider,
          metadata: {
            providerData: providerTx
          }
        }));
      }
    }

    return mismatches;
  }

  private createMismatch(data: {
    type: MismatchType;
    transactionId: string;
    orderId: string;
    localStatus: UnifiedPaymentStatus;
    providerStatus: string | null;
    localAmount: number;
    providerAmount: number | null;
    currency: string;
    provider: string;
    metadata?: Record<string, any>;
  }): Mismatch {
    const severity = ReconcileRules.getSeverity(data.type, {
      localStatus: data.localStatus,
      providerStatus: data.providerStatus,
      localAmount: data.localAmount,
      providerAmount: data.providerAmount
    });

    const recommendedAction = ReconcileRules.getRecommendedAction(data.type, {
      localStatus: data.localStatus,
      providerStatus: data.providerStatus,
      localAmount: data.localAmount,
      providerAmount: data.providerAmount
    });

    const mismatch: Mismatch = {
      id: `mismatch_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: data.type,
      transactionId: data.transactionId,
      orderId: data.orderId,
      localStatus: data.localStatus,
      providerStatus: data.providerStatus,
      localAmount: data.localAmount,
      providerAmount: data.providerAmount,
      currency: data.currency,
      provider: data.provider,
      recommendedAction,
      severity,
      detectedAt: new Date(),
      resolved: false,
      metadata: data.metadata
    };

    logger.info('Mismatch detected', {
      type: data.type,
      severity,
      transactionId: data.transactionId
    });

    return mismatch;
  }
}

export const mismatchDetector = new MismatchDetector();
