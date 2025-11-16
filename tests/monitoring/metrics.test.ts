import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetricsService } from '../../src/core/monitoring/metricsService';
import { dal } from '../../src/core/db/dal';

describe('MetricsService', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
  });

  describe('Prometheus Metrics', () => {
    it('should generate valid Prometheus metrics format', async () => {
      vi.spyOn(dal.transactions, 'list').mockResolvedValue([
        {
          id: 'tx_1',
          orderId: 'order_1',
          status: 'paid',
          provider: 'midtrans',
          amount: 100000,
          currency: 'IDR',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      const metrics = await metricsService.getPrometheusMetrics();

      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
      expect(metrics).toContain('transaction_total');
      expect(metrics).toContain('gateway_latency_ms');
      expect(metrics).toContain('uptime_seconds');
    });

    it('should include transaction metrics by status', async () => {
      vi.spyOn(dal.transactions, 'list').mockResolvedValue([
        {
          id: 'tx_1',
          orderId: 'order_1',
          status: 'paid',
          provider: 'midtrans',
          amount: 100000,
          currency: 'IDR',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'tx_2',
          orderId: 'order_2',
          status: 'pending',
          provider: 'xendit',
          amount: 50000,
          currency: 'IDR',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      const metrics = await metricsService.getPrometheusMetrics();

      expect(metrics).toContain('transaction_total{status="paid"}');
      expect(metrics).toContain('transaction_total{status="pending"}');
    });

    it('should include gateway metrics', async () => {
      const metrics = await metricsService.getPrometheusMetrics();

      expect(metrics).toContain('gateway_latency_ms');
      expect(metrics).toContain('gateway_up');
      expect(metrics).toContain('gateway_uptime_24h');
    });

    it('should include system metrics', async () => {
      const metrics = await metricsService.getPrometheusMetrics();

      expect(metrics).toContain('cpu_usage_percent');
      expect(metrics).toContain('memory_usage_bytes');
    });
  });

  describe('JSON Metrics', () => {
    it('should generate JSON metrics', async () => {
      vi.spyOn(dal.transactions, 'list').mockResolvedValue([]);

      const metrics = await metricsService.getMetricsJSON();

      expect(metrics).toBeDefined();
      expect(metrics.transactions).toBeDefined();
      expect(metrics.gateways).toBeDefined();
      expect(metrics.system).toBeDefined();
    });

    it('should include transaction breakdown', async () => {
      vi.spyOn(dal.transactions, 'list').mockResolvedValue([
        {
          id: 'tx_1',
          orderId: 'order_1',
          status: 'paid',
          provider: 'midtrans',
          amount: 100000,
          currency: 'IDR',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      const metrics = await metricsService.getMetricsJSON();

      expect(metrics.transactions.total).toBe(1);
      expect(metrics.transactions.byStatus).toBeDefined();
      expect(metrics.transactions.byGateway).toBeDefined();
    });
  });
});
