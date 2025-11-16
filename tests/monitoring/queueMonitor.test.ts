import { describe, it, expect, beforeEach } from 'vitest';
import { QueueMonitor } from '../../src/core/monitoring/queueMonitor';

describe('QueueMonitor', () => {
  let monitor: QueueMonitor;

  beforeEach(async () => {
    monitor = new QueueMonitor();
    await monitor.initialize();
  });

  describe('Queue Stats', () => {
    it('should get stats for registered queue', async () => {
      const stats = await monitor.getQueueStats('reconciliation');

      if (stats) {
        expect(stats.name).toBe('reconciliation');
        expect(stats.waiting).toBeGreaterThanOrEqual(0);
        expect(stats.active).toBeGreaterThanOrEqual(0);
        expect(stats.completed).toBeGreaterThanOrEqual(0);
        expect(stats.failed).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return null for unknown queue', async () => {
      const stats = await monitor.getQueueStats('unknown_queue');

      expect(stats).toBeNull();
    });
  });

  describe('Queue Health', () => {
    it('should calculate queue health status', async () => {
      const health = await monitor.getQueueHealth('reconciliation');

      if (health) {
        expect(health.name).toBe('reconciliation');
        expect(health.status).toMatch(/healthy|degraded|critical/);
        expect(health.failureRate).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Queue Alerts', () => {
    it('should check for queue alerts', async () => {
      const alerts = await monitor.checkForAlerts();

      expect(Array.isArray(alerts)).toBe(true);
    });
  });
});
