import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MismatchResolver } from '../../src/core/reconciliation/mismatchResolver';
import { Mismatch, MismatchType } from '../../src/core/reconciliation/types';
import { UnifiedPaymentStatus } from '../../src/core/payments/paymentTypes';
import { dal } from '../../src/core/db/dal';
import { transactionEngine } from '../../src/core/transactions/TransactionEngine';
import { auditLogger } from '../../src/core/audit/auditLogger';

describe('MismatchResolver', () => {
  let resolver: MismatchResolver;
  let mockMismatch: Mismatch;

  beforeEach(() => {
    resolver = new MismatchResolver();

    mockMismatch = {
      id: 'mismatch_123',
      type: MismatchType.STATUS_MISMATCH,
      transactionId: 'tx_1',
      orderId: 'order_1',
      localStatus: UnifiedPaymentStatus.PENDING,
      providerStatus: UnifiedPaymentStatus.PAID,
      localAmount: 100000,
      providerAmount: 100000,
      currency: 'IDR',
      provider: 'midtrans',
      recommendedAction: 'Sync from provider',
      severity: 'high',
      detectedAt: new Date(),
      resolved: false
    };
  });

  describe('Sync from Provider', () => {
    it('should sync transaction status from provider', async () => {
      const mockTransaction = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PENDING,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans',
        paymentId: 'pay_1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(dal.transactions, 'get').mockResolvedValue(mockTransaction);
      vi.spyOn(dal.transactions, 'update').mockResolvedValue(undefined);
      vi.spyOn(transactionEngine, 'processSuccessfulPayment').mockResolvedValue({
        success: true,
        message: 'Payment processed'
      });
      vi.spyOn(dal.settings, 'set').mockResolvedValue(undefined);
      vi.spyOn(auditLogger, 'log').mockResolvedValue(undefined);

      const result = await resolver.resolveMismatch(
        mockMismatch,
        'sync_from_provider',
        'admin_1',
        'Admin User',
        'Syncing status from provider'
      );

      expect(result).toBe(true);
      expect(mockMismatch.resolved).toBe(true);
      expect(mockMismatch.resolvedBy).toBe('Admin User');
    });

    it('should process order if provider status is paid', async () => {
      const mockTransaction = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PENDING,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans',
        paymentId: 'pay_1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(dal.transactions, 'get').mockResolvedValue(mockTransaction);
      vi.spyOn(dal.transactions, 'update').mockResolvedValue(undefined);
      const processPaymentSpy = vi
        .spyOn(transactionEngine, 'processSuccessfulPayment')
        .mockResolvedValue({
          success: true,
          message: 'Payment processed'
        });
      vi.spyOn(dal.settings, 'set').mockResolvedValue(undefined);
      vi.spyOn(auditLogger, 'log').mockResolvedValue(undefined);

      await resolver.resolveMismatch(
        mockMismatch,
        'sync_from_provider',
        'admin_1',
        'Admin User',
        'Syncing paid status'
      );

      expect(processPaymentSpy).toHaveBeenCalledWith('tx_1');
    });

    it('should fail if transaction not found', async () => {
      vi.spyOn(dal.transactions, 'get').mockResolvedValue(null);

      const result = await resolver.resolveMismatch(
        mockMismatch,
        'sync_from_provider',
        'admin_1',
        'Admin User',
        'Test'
      );

      expect(result).toBe(false);
    });

    it('should fail if provider status is null', async () => {
      const mismatchWithNullProvider = {
        ...mockMismatch,
        providerStatus: null
      };

      const result = await resolver.resolveMismatch(
        mismatchWithNullProvider,
        'sync_from_provider',
        'admin_1',
        'Admin User',
        'Test'
      );

      expect(result).toBe(false);
    });
  });

  describe('Force Local Status', () => {
    it('should force local status and add metadata', async () => {
      const mockTransaction = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PAID,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans',
        paymentId: 'pay_1',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      vi.spyOn(dal.transactions, 'get').mockResolvedValue(mockTransaction);
      const updateSpy = vi.spyOn(dal.transactions, 'update').mockResolvedValue(undefined);
      vi.spyOn(dal.settings, 'set').mockResolvedValue(undefined);
      vi.spyOn(auditLogger, 'log').mockResolvedValue(undefined);

      const result = await resolver.resolveMismatch(
        mockMismatch,
        'force_local_status',
        'admin_1',
        'Admin User',
        'Local status is verified correct'
      );

      expect(result).toBe(true);
      expect(updateSpy).toHaveBeenCalled();

      const updateCall = updateSpy.mock.calls[0][1];
      expect(updateCall.metadata.forcedStatus).toBe(true);
      expect(updateCall.metadata.forcedReason).toBe('Local status is verified correct');
    });
  });

  describe('Mark as Valid', () => {
    it('should mark mismatch as resolved without changes', async () => {
      vi.spyOn(dal.settings, 'set').mockResolvedValue(undefined);
      vi.spyOn(auditLogger, 'log').mockResolvedValue(undefined);

      const result = await resolver.resolveMismatch(
        mockMismatch,
        'mark_as_valid',
        'admin_1',
        'Admin User',
        'Known edge case'
      );

      expect(result).toBe(true);
      expect(mockMismatch.resolved).toBe(true);
    });
  });

  describe('Manual Review Flag', () => {
    it('should flag transaction for manual review', async () => {
      const mockTransaction = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PAID,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans',
        paymentId: 'pay_1',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      vi.spyOn(dal.transactions, 'get').mockResolvedValue(mockTransaction);
      const updateSpy = vi.spyOn(dal.transactions, 'update').mockResolvedValue(undefined);
      vi.spyOn(dal.settings, 'set').mockResolvedValue(undefined);
      vi.spyOn(auditLogger, 'log').mockResolvedValue(undefined);

      const result = await resolver.resolveMismatch(
        mockMismatch,
        'manual_review',
        'admin_1',
        'Admin User',
        'Needs investigation'
      );

      expect(result).toBe(true);

      const updateCall = updateSpy.mock.calls[0][1];
      expect(updateCall.metadata.flaggedForReview).toBe(true);
      expect(updateCall.metadata.flagReason).toBe(mockMismatch.recommendedAction);
    });
  });

  describe('Process Refund', () => {
    it('should process refund via transaction engine', async () => {
      const mockTransaction = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PAID,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans',
        paymentId: 'pay_1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(dal.transactions, 'get').mockResolvedValue(mockTransaction);
      const refundSpy = vi.spyOn(transactionEngine, 'refundTransaction').mockResolvedValue({
        success: true,
        message: 'Refund processed'
      });
      vi.spyOn(dal.settings, 'set').mockResolvedValue(undefined);
      vi.spyOn(auditLogger, 'log').mockResolvedValue(undefined);

      const result = await resolver.resolveMismatch(
        mockMismatch,
        'refund',
        'admin_1',
        'Admin User',
        'Duplicate payment detected'
      );

      expect(result).toBe(true);
      expect(refundSpy).toHaveBeenCalledWith('tx_1', 'Refunded due to reconciliation mismatch');
    });

    it('should fail if refund fails', async () => {
      const mockTransaction = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PAID,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans',
        paymentId: 'pay_1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(dal.transactions, 'get').mockResolvedValue(mockTransaction);
      vi.spyOn(transactionEngine, 'refundTransaction').mockResolvedValue({
        success: false,
        message: 'Refund failed'
      });

      const result = await resolver.resolveMismatch(
        mockMismatch,
        'refund',
        'admin_1',
        'Admin User',
        'Test'
      );

      expect(result).toBe(false);
    });
  });

  describe('Cancel Transaction', () => {
    it('should cancel transaction and update status', async () => {
      const mockTransaction = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PENDING,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans',
        paymentId: 'pay_1',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      vi.spyOn(dal.transactions, 'get').mockResolvedValue(mockTransaction);
      const updateSpy = vi.spyOn(dal.transactions, 'update').mockResolvedValue(undefined);
      vi.spyOn(dal.settings, 'set').mockResolvedValue(undefined);
      vi.spyOn(auditLogger, 'log').mockResolvedValue(undefined);

      const result = await resolver.resolveMismatch(
        mockMismatch,
        'cancel',
        'admin_1',
        'Admin User',
        'Invalid transaction'
      );

      expect(result).toBe(true);

      const updateCall = updateSpy.mock.calls[0][1];
      expect(updateCall.status).toBe(UnifiedPaymentStatus.CANCELLED);
      expect(updateCall.metadata.cancelReason).toBe('reconciliation_mismatch');
    });
  });

  describe('Batch Resolve', () => {
    it('should resolve multiple mismatches', async () => {
      const mismatches = [
        mockMismatch,
        { ...mockMismatch, id: 'mismatch_124', transactionId: 'tx_2' },
        { ...mockMismatch, id: 'mismatch_125', transactionId: 'tx_3' }
      ];

      vi.spyOn(dal.transactions, 'get').mockResolvedValue({
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PENDING,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans',
        paymentId: 'pay_1',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      vi.spyOn(dal.transactions, 'update').mockResolvedValue(undefined);
      vi.spyOn(dal.settings, 'set').mockResolvedValue(undefined);
      vi.spyOn(auditLogger, 'log').mockResolvedValue(undefined);
      vi.spyOn(transactionEngine, 'processSuccessfulPayment').mockResolvedValue({
        success: true,
        message: 'Payment processed'
      });

      const result = await resolver.batchResolve(
        mismatches,
        'sync_from_provider',
        'admin_1',
        'Admin User',
        'Batch sync'
      );

      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('should track failed resolutions', async () => {
      const mismatches = [
        mockMismatch,
        { ...mockMismatch, id: 'mismatch_124', transactionId: 'tx_2' }
      ];

      vi.spyOn(dal.transactions, 'get')
        .mockResolvedValueOnce({
          id: 'tx_1',
          orderId: 'order_1',
          status: UnifiedPaymentStatus.PENDING,
          amount: 100000,
          currency: 'IDR',
          provider: 'midtrans',
          paymentId: 'pay_1',
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .mockResolvedValueOnce(null); // Second fails

      vi.spyOn(dal.transactions, 'update').mockResolvedValue(undefined);
      vi.spyOn(dal.settings, 'set').mockResolvedValue(undefined);
      vi.spyOn(auditLogger, 'log').mockResolvedValue(undefined);
      vi.spyOn(transactionEngine, 'processSuccessfulPayment').mockResolvedValue({
        success: true,
        message: 'Payment processed'
      });

      const result = await resolver.batchResolve(
        mismatches,
        'sync_from_provider',
        'admin_1',
        'Admin User',
        'Batch sync'
      );

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('Audit Logging', () => {
    it('should log resolution to audit log', async () => {
      const mockTransaction = {
        id: 'tx_1',
        orderId: 'order_1',
        status: UnifiedPaymentStatus.PENDING,
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans',
        paymentId: 'pay_1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(dal.transactions, 'get').mockResolvedValue(mockTransaction);
      vi.spyOn(dal.transactions, 'update').mockResolvedValue(undefined);
      vi.spyOn(transactionEngine, 'processSuccessfulPayment').mockResolvedValue({
        success: true,
        message: 'Payment processed'
      });
      vi.spyOn(dal.settings, 'set').mockResolvedValue(undefined);
      const auditSpy = vi.spyOn(auditLogger, 'log').mockResolvedValue(undefined);

      await resolver.resolveMismatch(
        mockMismatch,
        'sync_from_provider',
        'admin_1',
        'Admin User',
        'Test notes'
      );

      expect(auditSpy).toHaveBeenCalled();
      const auditCall = auditSpy.mock.calls[0][0];
      expect(auditCall.adminId).toBe('admin_1');
      expect(auditCall.adminUsername).toBe('Admin User');
      expect(auditCall.metadata.type).toBe(MismatchType.STATUS_MISMATCH);
      expect(auditCall.metadata.action).toBe('sync_from_provider');
    });
  });
});
