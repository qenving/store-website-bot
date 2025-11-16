import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BotShardManager, ShardManagerConfig } from '../../src/core/scaling/ShardManager';

describe('BotShardManager', () => {
  let shardManager: BotShardManager;
  const mockConfig: ShardManagerConfig = {
    token: 'test-token',
    totalShards: 2,
    respawn: true
  };

  beforeEach(() => {
    shardManager = new BotShardManager(mockConfig);
  });

  afterEach(async () => {
    if (shardManager) {
      await shardManager.shutdown();
    }
  });

  it('should create shard manager with config', () => {
    expect(shardManager).toBeDefined();
    expect(shardManager.getManager()).toBeNull(); // Not initialized yet
  });

  it('should track shard statistics', async () => {
    const stats = shardManager.getAllShardStats();
    expect(Array.isArray(stats)).toBe(true);
  });

  it('should handle shard events', (done) => {
    shardManager.on('shardReady', (shardId) => {
      expect(typeof shardId).toBe('number');
      done();
    });
  });

  it('should get shard stats by id', () => {
    const stats = shardManager.getShardStats(0);
    expect(stats).toBeDefined();
  });
});
