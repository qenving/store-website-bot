import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AutoScaler, AutoScalerConfig } from '../../src/core/scaling/AutoScaler';

describe('AutoScaler', () => {
  let autoScaler: AutoScaler;

  const mockConfig: AutoScalerConfig = {
    enabled: true,
    minInstances: 2,
    maxInstances: 10,
    checkInterval: 5000,
    scalingCooldown: 30000,
    rules: [
      {
        metric: 'cpu',
        scaleUpThreshold: 80,
        scaleDownThreshold: 20,
        scaleUpIncrement: 2,
        scaleDownIncrement: 1,
        cooldownPeriod: 60000
      }
    ]
  };

  beforeEach(() => {
    autoScaler = new AutoScaler(mockConfig, 3);
  });

  afterEach(() => {
    if (autoScaler) {
      autoScaler.stop();
    }
  });

  it('should create autoscaler with config', () => {
    expect(autoScaler).toBeDefined();
    expect(autoScaler.getCurrentInstances()).toBe(3);
  });

  it('should get autoscaler stats', () => {
    const stats = autoScaler.getStats();

    expect(stats).toHaveProperty('enabled');
    expect(stats).toHaveProperty('currentInstances');
    expect(stats).toHaveProperty('minInstances');
    expect(stats).toHaveProperty('maxInstances');
    expect(stats.currentInstances).toBe(3);
  });

  it('should respect min/max instance bounds', () => {
    expect(() => {
      autoScaler.setInstanceCount(1);
    }).toThrow();

    expect(() => {
      autoScaler.setInstanceCount(11);
    }).toThrow();

    expect(() => {
      autoScaler.setInstanceCount(5);
    }).not.toThrow();
  });

  it('should track scaling history', () => {
    const history = autoScaler.getScalingHistory(10);
    expect(Array.isArray(history)).toBe(true);
  });

  it('should enable/disable autoscaling', () => {
    autoScaler.disable();
    expect(autoScaler.getStats().enabled).toBe(false);

    autoScaler.enable();
    expect(autoScaler.getStats().enabled).toBe(true);
  });
});
