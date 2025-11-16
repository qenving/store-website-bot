import { describe, it, expect, beforeEach } from 'vitest';
import { CronHistory } from '../../src/core/monitoring/cronHistory';

describe('CronHistory', () => {
  let cronHistory: CronHistory;

  beforeEach(() => {
    cronHistory = new CronHistory();
  });

  describe('Cron Execution Tracking', () => {
    it('should start execution and return ID', async () => {
      const id = await cronHistory.startExecution('test_task');

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(cronHistory.isRunning('test_task')).toBe(true);
    });

    it('should complete execution successfully', async () => {
      const id = await cronHistory.startExecution('test_task');
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
      await cronHistory.completeExecution('test_task', true);

      expect(cronHistory.isRunning('test_task')).toBe(false);

      const history = cronHistory.getExecutionHistory('test_task');
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].status).toBe('success');
    });

    it('should complete execution with failure', async () => {
      await cronHistory.startExecution('test_task');
      await cronHistory.completeExecution('test_task', false, 'Test error');

      const history = cronHistory.getExecutionHistory('test_task');
      expect(history[0].status).toBe('failed');
      expect(history[0].error).toBe('Test error');
    });

    it('should record execution duration', async () => {
      await cronHistory.startExecution('test_task');
      await new Promise(resolve => setTimeout(resolve, 100));
      await cronHistory.completeExecution('test_task', true);

      const history = cronHistory.getExecutionHistory('test_task');
      expect(history[0].duration).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Cron Stats', () => {
    it('should get cron stats', () => {
      const stats = cronHistory.getCronStats('test_task', '0 3 * * *');

      expect(stats).toBeDefined();
      expect(stats.taskName).toBe('test_task');
      expect(stats.schedule).toBe('0 3 * * *');
      expect(stats.successRate).toBeGreaterThanOrEqual(0);
    });

    it('should calculate success rate correctly', async () => {
      await cronHistory.startExecution('test_task');
      await cronHistory.completeExecution('test_task', true);

      await cronHistory.startExecution('test_task');
      await cronHistory.completeExecution('test_task', false);

      const stats = cronHistory.getCronStats('test_task', '0 3 * * *');

      expect(stats.successRate).toBe(50);
      expect(stats.totalRuns).toBe(2);
    });
  });

  describe('Execution History', () => {
    it('should get execution history', async () => {
      await cronHistory.startExecution('test_task');
      await cronHistory.completeExecution('test_task', true);

      const history = cronHistory.getExecutionHistory('test_task');

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should limit history entries', async () => {
      for (let i = 0; i < 60; i++) {
        await cronHistory.startExecution('test_task');
        await cronHistory.completeExecution('test_task', true);
      }

      const history = cronHistory.getExecutionHistory('test_task', 50);

      expect(history.length).toBeLessThanOrEqual(50);
    });
  });
});
