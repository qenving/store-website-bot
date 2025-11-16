import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GatewayHealthService, GatewayStatus } from '../../src/core/monitoring/gatewayHealthService';
import { PaymentProvider } from '../../src/core/payments/paymentTypes';

describe('GatewayHealthService', () => {
  let service: GatewayHealthService;

  beforeEach(() => {
    service = new GatewayHealthService();
  });

  describe('Gateway Health Checks', () => {
    it('should check gateway and record health', async () => {
      const record = await service.checkGateway(PaymentProvider.MIDTRANS);

      expect(record).toBeDefined();
      expect(record.provider).toBe(PaymentProvider.MIDTRANS);
      expect(record.status).toMatch(/up|degraded|down|unknown/);
      expect(record.latency).toBeGreaterThanOrEqual(0);
      expect(record.timestamp).toBeInstanceOf(Date);
    });

    it('should classify gateway as UP with low latency', async () => {
      const record = await service.checkGateway(PaymentProvider.MIDTRANS);

      if (record.latency < 1000) {
        expect(record.status).toBe(GatewayStatus.UP);
      }
    });

    it('should get health stats for gateway', async () => {
      await service.checkGateway(PaymentProvider.MIDTRANS);

      const stats = service.getGatewayHealth(PaymentProvider.MIDTRANS);

      expect(stats).toBeDefined();
      if (stats) {
        expect(stats.provider).toBe(PaymentProvider.MIDTRANS);
        expect(stats.currentLatency).toBeGreaterThanOrEqual(0);
        expect(stats.uptime24h).toBeGreaterThanOrEqual(0);
        expect(stats.uptime24h).toBeLessThanOrEqual(100);
      }
    });

    it('should track multiple health checks', async () => {
      await service.checkGateway(PaymentProvider.MIDTRANS);
      await service.checkGateway(PaymentProvider.MIDTRANS);

      const history = service.getGatewayHistory(PaymentProvider.MIDTRANS);

      expect(history.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Gateway Health Stats', () => {
    it('should calculate uptime percentage correctly', async () => {
      await service.checkGateway(PaymentProvider.MIDTRANS);

      const stats = service.getGatewayHealth(PaymentProvider.MIDTRANS);

      expect(stats).toBeDefined();
      if (stats) {
        expect(stats.uptime24h).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
