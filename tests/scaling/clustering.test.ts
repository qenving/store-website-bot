import { describe, it, expect, beforeEach } from 'vitest';
import { ClusterManager, ClusterConfig } from '../../src/core/scaling/ClusterManager';

describe('ClusterManager', () => {
  const mockConfig: ClusterConfig = {
    workers: 2,
    respawn: true,
    maxRestarts: 3,
    restartWindow: 60000
  };

  it('should create cluster manager with config', () => {
    const manager = new ClusterManager(mockConfig);
    expect(manager).toBeDefined();
  });

  it('should track worker statistics', () => {
    const manager = new ClusterManager(mockConfig);
    const stats = manager.getClusterStats();

    expect(stats).toHaveProperty('totalWorkers');
    expect(stats).toHaveProperty('onlineWorkers');
  });

  it('should broadcast messages to workers', () => {
    const manager = new ClusterManager(mockConfig);

    expect(() => {
      manager.broadcast({ type: 'test', data: 'hello' });
    }).not.toThrow();
  });
});
