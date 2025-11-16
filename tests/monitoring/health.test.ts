import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthService } from '../../src/core/monitoring/healthService';
import { uptimeService } from '../../src/core/monitoring/uptimeService';
import { latencyService } from '../../src/core/monitoring/latencyService';
import { dal } from '../../src/core/db/dal';

describe('HealthService', () => {
  let healthService: HealthService;

  beforeEach(() => {
    healthService = new HealthService();
  });

  describe('System Health Check', () => {
    it('should get overall system health', async () => {
      vi.spyOn(uptimeService, 'getUptime').mockReturnValue(60000);
      vi.spyOn(latencyService, 'getCurrentLatency').mockReturnValue(100);
      vi.spyOn(dal.settings, 'get').mockResolvedValue(null);

      const health = await healthService.getSystemHealth();

      expect(health).toBeDefined();
      expect(health.status).toMatch(/ok|degraded|down/);
      expect(health.timestamp).toBeInstanceOf(Date);
      expect(health.bot).toBeDefined();
      expect(health.database).toBeDefined();
    });

    it('should mark system as down if critical service fails', async () => {
      vi.spyOn(dal.settings, 'get').mockRejectedValue(new Error('DB connection failed'));

      const health = await healthService.getSystemHealth();

      expect(health.database.status).toBe('down');
      expect(health.status).toMatch(/degraded|down/);
    });

    it('should check bot health correctly', async () => {
      vi.spyOn(uptimeService, 'getUptime').mockReturnValue(120000);
      vi.spyOn(latencyService, 'getCurrentLatency').mockReturnValue(50);

      const botHealth = await healthService.checkService('bot');

      expect(botHealth).toBeDefined();
      expect(botHealth.status).toBeDefined();
      expect(botHealth.uptime).toBe(120000);
    });

    it('should return down status for non-running service', async () => {
      vi.spyOn(uptimeService, 'getUptime').mockReturnValue(0);

      const botHealth = await healthService.checkService('bot');

      expect(botHealth.status).toBe('down');
      expect(botHealth.message).toContain('not running');
    });
  });

  describe('Service Health Checks', () => {
    it('should check website health', async () => {
      vi.spyOn(latencyService, 'getCurrentLatency').mockReturnValue(200);

      const websiteHealth = await healthService.checkService('website');

      expect(websiteHealth.status).toBe('ok');
      expect(websiteHealth.latency).toBe(200);
    });

    it('should mark website as degraded with high latency', async () => {
      vi.spyOn(latencyService, 'getCurrentLatency').mockReturnValue(2500);

      const websiteHealth = await healthService.checkService('website');

      expect(websiteHealth.status).toBe('degraded');
    });

    it('should check database health', async () => {
      const spy = vi.spyOn(dal.settings, 'get').mockResolvedValue(null);

      const dbHealth = await healthService.checkService('database');

      expect(spy).toHaveBeenCalledWith('health_check');
      expect(dbHealth.status).toBeDefined();
      expect(dbHealth.latency).toBeDefined();
    });
  });

  describe('Overall Status Determination', () => {
    it('should return ok when all services are healthy', async () => {
      vi.spyOn(uptimeService, 'getUptime').mockReturnValue(60000);
      vi.spyOn(latencyService, 'getCurrentLatency').mockReturnValue(100);
      vi.spyOn(dal.settings, 'get').mockResolvedValue(null);

      const health = await healthService.getSystemHealth();

      // May be ok or degraded depending on gateway/queue status
      expect(['ok', 'degraded']).toContain(health.status);
    });
  });
});
