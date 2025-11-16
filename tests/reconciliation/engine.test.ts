import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReconcileEngine } from '../../src/core/reconciliation/reconcileEngine';
import { ReconcileStatus, MismatchType } from '../../src/core/reconciliation/types';
import { dal } from '../../src/core/db/dal';
import { paymentManager } from '../../src/core/payments/paymentManager';

describe('ReconcileEngine', () => {
  let engine: ReconcileEngine;

  beforeEach(async () => {
    engine = new ReconcileEngine();
    await engine.initialize();
  });

  afterEach(() => {
    engine.stopCronJob();
  });

  describe('Configuration', () => {
    it('should load default configuration', () => {
      const config = engine.getConfig();

      expect(config).toBeDefined();
      expect(config.enabled).toBe(true);
      expect(config.cronSchedule).toBe('0 3 * * *');
      expect(config.batchSize).toBeGreaterThan(0);
    });

    it('should update configuration', async () => {
      await engine.updateConfig({
        enabled: false,
        batchSize: 100
      });

      const config = engine.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.batchSize).toBe(100);
    });

    it('should restart cron job when schedule changes', async () => {
      const stopSpy = vi.spyOn(engine, 'stopCronJob');
      const startSpy = vi.spyOn(engine, 'startCronJob');

      await engine.updateConfig({
        cronSchedule: '0 4 * * *'
      });

      expect(stopSpy).toHaveBeenCalled();
      expect(startSpy).toHaveBeenCalled();
    });
  });

  describe('Reconciliation Workflow', () => {
    it('should run manual reconciliation', async () => {
      // Mock transaction data
      vi.spyOn(dal.transactions, 'list').mockResolvedValue([
        {
          id: 'tx_1',
          orderId: 'order_1',
          status: 'paid',
          amount: 100000,
          currency: 'IDR',
          provider: 'midtrans',
          paymentId: 'pay_1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      // Mock payment status
      vi.spyOn(paymentManager, 'getPaymentStatus').mockResolvedValue({
        success: true,
        paymentId: 'pay_1',
        status: 'paid',
        amount: 100000,
        currency: 'IDR',
        providerStatus: 'settlement'
      });

      const report = await engine.runReconciliation('manual', 'admin_test');

      expect(report).toBeDefined();
      expect(report.status).toBe(ReconcileStatus.COMPLETED);
      expect(report.runType).toBe('manual');
      expect(report.triggeredBy).toBe('admin_test');
      expect(report.totalTransactions).toBeGreaterThanOrEqual(0);
    });

    it('should prevent concurrent reconciliation runs', async () => {
      // Start first reconciliation
      const promise1 = engine.runReconciliation('manual');

      // Try to start second reconciliation
      await expect(engine.runReconciliation('manual')).rejects.toThrow(
        'Reconciliation already in progress'
      );

      await promise1;
    });

    it('should detect status mismatches', async () => {
      vi.spyOn(dal.transactions, 'list').mockResolvedValue([
        {
          id: 'tx_1',
          orderId: 'order_1',
          status: 'pending',
          amount: 100000,
          currency: 'IDR',
          provider: 'midtrans',
          paymentId: 'pay_1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      vi.spyOn(paymentManager, 'getPaymentStatus').mockResolvedValue({
        success: true,
        paymentId: 'pay_1',
        status: 'paid',
        amount: 100000,
        currency: 'IDR',
        providerStatus: 'settlement'
      });

      const report = await engine.runReconciliation('manual');

      expect(report.mismatchCount).toBeGreaterThan(0);
      expect(report.mismatches[0].type).toBe(MismatchType.STATUS_MISMATCH);
    });

    it('should detect amount mismatches', async () => {
      vi.spyOn(dal.transactions, 'list').mockResolvedValue([
        {
          id: 'tx_1',
          orderId: 'order_1',
          status: 'paid',
          amount: 100000,
          currency: 'IDR',
          provider: 'midtrans',
          paymentId: 'pay_1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      vi.spyOn(paymentManager, 'getPaymentStatus').mockResolvedValue({
        success: true,
        paymentId: 'pay_1',
        status: 'paid',
        amount: 150000, // Different amount
        currency: 'IDR',
        providerStatus: 'settlement'
      });

      const report = await engine.runReconciliation('manual');

      expect(report.mismatchCount).toBeGreaterThan(0);
      const amountMismatch = report.mismatches.find(
        m => m.type === MismatchType.AMOUNT_MISMATCH
      );
      expect(amountMismatch).toBeDefined();
    });

    it('should handle provider errors gracefully', async () => {
      vi.spyOn(dal.transactions, 'list').mockResolvedValue([
        {
          id: 'tx_1',
          orderId: 'order_1',
          status: 'paid',
          amount: 100000,
          currency: 'IDR',
          provider: 'midtrans',
          paymentId: 'pay_1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      vi.spyOn(paymentManager, 'getPaymentStatus').mockRejectedValue(
        new Error('Provider API error')
      );

      const report = await engine.runReconciliation('manual');

      expect(report.errorCount).toBeGreaterThan(0);
      expect(report.errors[0].error).toContain('Provider API error');
    });
  });

  describe('Job Status', () => {
    it('should track current job status', async () => {
      expect(engine.getCurrentJob()).toBeNull();
      expect(engine.isReconciliationRunning()).toBe(false);

      // Mock quick reconciliation
      vi.spyOn(dal.transactions, 'list').mockResolvedValue([]);

      const promise = engine.runReconciliation('manual');

      // During reconciliation
      expect(engine.isReconciliationRunning()).toBe(true);
      const currentJob = engine.getCurrentJob();
      expect(currentJob).toBeDefined();
      expect(currentJob?.type).toBe('manual');

      await promise;

      // After reconciliation
      expect(engine.isReconciliationRunning()).toBe(false);
      expect(engine.getCurrentJob()).toBeNull();
    });
  });

  describe('Batch Processing', () => {
    it('should process transactions in batches', async () => {
      const transactions = Array.from({ length: 150 }, (_, i) => ({
        id: `tx_${i}`,
        orderId: `order_${i}`,
        status: 'paid',
        amount: 100000,
        currency: 'IDR',
        provider: 'midtrans',
        paymentId: `pay_${i}`,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      vi.spyOn(dal.transactions, 'list').mockResolvedValue(transactions);

      vi.spyOn(paymentManager, 'getPaymentStatus').mockResolvedValue({
        success: true,
        paymentId: 'pay_1',
        status: 'paid',
        amount: 100000,
        currency: 'IDR',
        providerStatus: 'settlement'
      });

      const report = await engine.runReconciliation('manual');

      expect(report.checkedTransactions).toBe(150);
    });
  });
});
