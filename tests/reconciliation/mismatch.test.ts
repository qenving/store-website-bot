import { describe, it, expect, beforeEach } from 'vitest';
import { MismatchDetector } from '../../src/core/reconciliation/mismatchDetector';
import { MismatchType } from '../../src/core/reconciliation/types';
import { UnifiedPaymentStatus } from '../../src/core/payments/paymentTypes';

describe('MismatchDetector', () => {
  let detector: MismatchDetector;

  beforeEach(() => {
    detector = new MismatchDetector();
  });

  describe('Status Mismatch Detection', () => {
    it('should detect status mismatch', () => {
      const localTx = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PENDING,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans'
      };

      const providerData = {
        status: UnifiedPaymentStatus.PAID,
        amount: 100000,
        providerStatus: 'settlement'
      };

      const mismatches = detector.detectMismatches(localTx, providerData);

      expect(mismatches).toHaveLength(1);
      expect(mismatches[0].type).toBe(MismatchType.STATUS_MISMATCH);
      expect(mismatches[0].localStatus).toBe(UnifiedPaymentStatus.PENDING);
      expect(mismatches[0].providerStatus).toBe(UnifiedPaymentStatus.PAID);
    });

    it('should assign critical severity for paid vs failed mismatch', () => {
      const localTx = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PAID,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans'
      };

      const providerData = {
        status: UnifiedPaymentStatus.FAILED,
        amount: 100000,
        providerStatus: 'deny'
      };

      const mismatches = detector.detectMismatches(localTx, providerData);

      expect(mismatches[0].severity).toBe('critical');
    });

    it('should assign high severity for provider paid but local not paid', () => {
      const localTx = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PENDING,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans'
      };

      const providerData = {
        status: UnifiedPaymentStatus.PAID,
        amount: 100000,
        providerStatus: 'settlement'
      };

      const mismatches = detector.detectMismatches(localTx, providerData);

      expect(mismatches[0].severity).toBe('high');
    });
  });

  describe('Amount Mismatch Detection', () => {
    it('should detect amount mismatch beyond tolerance', () => {
      const localTx = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PAID,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans'
      };

      const providerData = {
        status: UnifiedPaymentStatus.PAID,
        amount: 150000, // 50% difference
        providerStatus: 'settlement'
      };

      const mismatches = detector.detectMismatches(localTx, providerData);

      const amountMismatch = mismatches.find(m => m.type === MismatchType.AMOUNT_MISMATCH);
      expect(amountMismatch).toBeDefined();
      expect(amountMismatch?.severity).toBe('critical');
    });

    it('should not detect mismatch within 1% tolerance', () => {
      const localTx = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PAID,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans'
      };

      const providerData = {
        status: UnifiedPaymentStatus.PAID,
        amount: 100500, // 0.5% difference
        providerStatus: 'settlement'
      };

      const mismatches = detector.detectMismatches(localTx, providerData);

      const amountMismatch = mismatches.find(m => m.type === MismatchType.AMOUNT_MISMATCH);
      expect(amountMismatch).toBeUndefined();
    });

    it('should calculate percentage difference correctly', () => {
      const localTx = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PAID,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans'
      };

      const providerData = {
        status: UnifiedPaymentStatus.PAID,
        amount: 110000, // 10% difference
        providerStatus: 'settlement'
      };

      const mismatches = detector.detectMismatches(localTx, providerData);

      const amountMismatch = mismatches.find(m => m.type === MismatchType.AMOUNT_MISMATCH);
      expect(amountMismatch?.metadata?.percentageDiff).toBeCloseTo(10, 1);
    });
  });

  describe('Missing Provider Detection', () => {
    it('should detect missing provider data', () => {
      const localTx = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PAID,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans'
      };

      const mismatches = detector.detectMismatches(localTx, null);

      expect(mismatches).toHaveLength(1);
      expect(mismatches[0].type).toBe(MismatchType.MISSING_PROVIDER);
      expect(mismatches[0].severity).toBe('high');
    });

    it('should detect provider error as missing provider', () => {
      const localTx = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PAID,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans'
      };

      const providerData = {
        error: 'Provider API error'
      };

      const mismatches = detector.detectMismatches(localTx, providerData);

      expect(mismatches[0].type).toBe(MismatchType.MISSING_PROVIDER);
      expect(mismatches[0].metadata?.providerError).toBeDefined();
    });
  });

  describe('Duplicate Payment Detection', () => {
    it('should detect duplicate payments with same paymentId', () => {
      const transactions = [
        {
          id: 'tx_1',
          orderId: 'order_1',
          status: UnifiedPaymentStatus.PAID,
          amount: 100000,
          currency: 'IDR',
          provider: 'midtrans',
          paymentId: 'pay_123'
        },
        {
          id: 'tx_2',
          orderId: 'order_2',
          status: UnifiedPaymentStatus.PAID,
          amount: 100000,
          currency: 'IDR',
          provider: 'midtrans',
          paymentId: 'pay_123' // Same paymentId
        }
      ];

      const mismatches = detector.detectDuplicatePayments(transactions);

      expect(mismatches).toHaveLength(2); // One for each duplicate
      expect(mismatches[0].type).toBe(MismatchType.DUPLICATE_PAYMENT);
      expect(mismatches[0].severity).toBe('critical');
      expect(mismatches[0].metadata?.duplicateCount).toBe(2);
    });

    it('should not detect duplicates for unique paymentIds', () => {
      const transactions = [
        {
          id: 'tx_1',
          orderId: 'order_1',
          status: UnifiedPaymentStatus.PAID,
          amount: 100000,
          currency: 'IDR',
          provider: 'midtrans',
          paymentId: 'pay_123'
        },
        {
          id: 'tx_2',
          orderId: 'order_2',
          status: UnifiedPaymentStatus.PAID,
          amount: 100000,
          currency: 'IDR',
          provider: 'midtrans',
          paymentId: 'pay_456'
        }
      ];

      const mismatches = detector.detectDuplicatePayments(transactions);

      expect(mismatches).toHaveLength(0);
    });

    it('should handle transactions without paymentId', () => {
      const transactions = [
        {
          id: 'tx_1',
          orderId: 'order_1',
          status: UnifiedPaymentStatus.PAID,
          amount: 100000,
          currency: 'IDR',
          provider: 'midtrans',
          paymentId: null
        }
      ];

      const mismatches = detector.detectDuplicatePayments(transactions);

      expect(mismatches).toHaveLength(0);
    });
  });

  describe('Missing Local Detection', () => {
    it('should detect payments missing in local database', () => {
      const providerTransactions = [
        {
          paymentId: 'pay_1',
          orderId: 'order_1',
          status: UnifiedPaymentStatus.PAID,
          amount: 100000,
          currency: 'IDR',
          provider: 'midtrans'
        },
        {
          paymentId: 'pay_2',
          orderId: 'order_2',
          status: UnifiedPaymentStatus.PAID,
          amount: 150000,
          currency: 'IDR',
          provider: 'midtrans'
        }
      ];

      const localTransactionIds = new Set(['pay_1']);

      const mismatches = detector.detectMissingLocal(providerTransactions, localTransactionIds);

      expect(mismatches).toHaveLength(1);
      expect(mismatches[0].type).toBe(MismatchType.MISSING_LOCAL);
      expect(mismatches[0].transactionId).toBe('pay_2');
      expect(mismatches[0].severity).toBe('critical');
    });

    it('should not flag transactions that exist locally', () => {
      const providerTransactions = [
        {
          paymentId: 'pay_1',
          orderId: 'order_1',
          status: UnifiedPaymentStatus.PAID,
          amount: 100000,
          currency: 'IDR',
          provider: 'midtrans'
        }
      ];

      const localTransactionIds = new Set(['pay_1']);

      const mismatches = detector.detectMissingLocal(providerTransactions, localTransactionIds);

      expect(mismatches).toHaveLength(0);
    });
  });

  describe('Recommended Actions', () => {
    it('should provide recommended action for status mismatch', () => {
      const localTx = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PENDING,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans'
      };

      const providerData = {
        status: UnifiedPaymentStatus.PAID,
        amount: 100000,
        providerStatus: 'settlement'
      };

      const mismatches = detector.detectMismatches(localTx, providerData);

      expect(mismatches[0].recommendedAction).toContain('Sync from provider');
    });

    it('should recommend urgent review for critical mismatches', () => {
      const localTx = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PAID,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans'
      };

      const providerData = {
        status: UnifiedPaymentStatus.FAILED,
        amount: 100000,
        providerStatus: 'deny'
      };

      const mismatches = detector.detectMismatches(localTx, providerData);

      expect(mismatches[0].recommendedAction).toContain('URGENT');
      expect(mismatches[0].recommendedAction).toContain('Manual review');
    });
  });
});
