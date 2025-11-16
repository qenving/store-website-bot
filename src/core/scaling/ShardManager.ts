import { ShardingManager, Shard } from 'discord.js';
import { createLogger } from '../logging/logger';
import { EventEmitter } from 'events';
import * as path from 'path';

const logger = createLogger({ module: 'ShardManager' });

export interface ShardStats {
  id: number;
  status: 'ready' | 'connecting' | 'reconnecting' | 'idle' | 'disconnected';
  guilds: number;
  ping: number;
  uptime: number;
  memory: number;
}

export interface ShardManagerConfig {
  token: string;
  totalShards: number | 'auto';
  shardsPerCluster?: number;
  respawn: boolean;
  execArgv?: string[];
}

/**
 * Discord Bot Sharding Manager
 * Manages multiple Discord bot shards for horizontal scaling
 */
export class BotShardManager extends EventEmitter {
  private manager: ShardingManager | null = null;
  private shardStats: Map<number, ShardStats> = new Map();
  private config: ShardManagerConfig;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: ShardManagerConfig) {
    super();
    this.config = config;
  }

  /**
   * Initialize and spawn all shards
   */
  async initialize(): Promise<void> {
    const botPath = path.join(__dirname, '../../bot/index.ts');

    this.manager = new ShardingManager(botPath, {
      token: this.config.token,
      totalShards: this.config.totalShards,
      respawn: this.config.respawn,
      execArgv: this.config.execArgv || ['-r', 'ts-node/register']
    });

    this.setupEventHandlers();

    logger.info('Spawning shards...', {
      totalShards: this.config.totalShards
    });

    await this.manager.spawn({ timeout: 60000 });

    logger.info('All shards spawned successfully');

    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Setup event handlers for shard lifecycle
   */
  private setupEventHandlers(): void {
    if (!this.manager) return;

    this.manager.on('shardCreate', (shard: Shard) => {
      logger.info(`Shard ${shard.id} created`, {
        shardId: shard.id,
        totalShards: this.manager?.totalShards
      });

      this.shardStats.set(shard.id, {
        id: shard.id,
        status: 'connecting',
        guilds: 0,
        ping: 0,
        uptime: 0,
        memory: 0
      });

      shard.on('ready', () => {
        logger.info(`Shard ${shard.id} ready`);
        this.updateShardStatus(shard.id, 'ready');
        this.emit('shardReady', shard.id);
      });

      shard.on('disconnect', () => {
        logger.warn(`Shard ${shard.id} disconnected`);
        this.updateShardStatus(shard.id, 'disconnected');
        this.emit('shardDisconnect', shard.id);
      });

      shard.on('reconnecting', () => {
        logger.info(`Shard ${shard.id} reconnecting`);
        this.updateShardStatus(shard.id, 'reconnecting');
        this.emit('shardReconnecting', shard.id);
      });

      shard.on('death', () => {
        logger.error(`Shard ${shard.id} died`);
        this.emit('shardDeath', shard.id);

        if (this.config.respawn) {
          logger.info(`Respawning shard ${shard.id}...`);
          shard.respawn().catch((error) => {
            logger.error(`Failed to respawn shard ${shard.id}`, error);
          });
        }
      });

      shard.on('error', (error) => {
        logger.error(`Shard ${shard.id} error`, error);
        this.emit('shardError', { shardId: shard.id, error });
      });
    });
  }

  /**
   * Update shard status
   */
  private updateShardStatus(shardId: number, status: ShardStats['status']): void {
    const stats = this.shardStats.get(shardId);
    if (stats) {
      stats.status = status;
      this.shardStats.set(shardId, stats);
    }
  }

  /**
   * Start periodic health monitoring of all shards
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.collectShardStats().catch((error) => {
        logger.error('Failed to collect shard stats', error);
      });
    }, 30000); // Every 30 seconds
  }

  /**
   * Collect statistics from all shards
   */
  async collectShardStats(): Promise<void> {
    if (!this.manager) return;

    const promises = this.manager.shards.map(async (shard) => {
      try {
        const [guilds, ping, uptime, memory] = await Promise.all([
          shard.fetchClientValue('guilds.cache.size') as Promise<number>,
          shard.fetchClientValue('ws.ping') as Promise<number>,
          shard.fetchClientValue('uptime') as Promise<number>,
          shard.fetchClientValue('process.memoryUsage().heapUsed') as Promise<number>
        ]);

        const stats: ShardStats = {
          id: shard.id,
          status: shard.ready ? 'ready' : 'connecting',
          guilds,
          ping,
          uptime,
          memory: Math.round(memory / 1024 / 1024) // Convert to MB
        };

        this.shardStats.set(shard.id, stats);
      } catch (error) {
        logger.error(`Failed to fetch stats for shard ${shard.id}`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Get statistics for all shards
   */
  getAllShardStats(): ShardStats[] {
    return Array.from(this.shardStats.values());
  }

  /**
   * Get statistics for specific shard
   */
  getShardStats(shardId: number): ShardStats | undefined {
    return this.shardStats.get(shardId);
  }

  /**
   * Broadcast eval to all shards
   */
  async broadcastEval<T>(script: string): Promise<T[]> {
    if (!this.manager) {
      throw new Error('Shard manager not initialized');
    }

    return this.manager.broadcastEval(script) as Promise<T[]>;
  }

  /**
   * Respawn a specific shard
   */
  async respawnShard(shardId: number): Promise<void> {
    const shard = this.manager?.shards.get(shardId);
    if (!shard) {
      throw new Error(`Shard ${shardId} not found`);
    }

    logger.info(`Manually respawning shard ${shardId}`);
    await shard.respawn();
  }

  /**
   * Respawn all shards sequentially
   */
  async respawnAll(delay: number = 5000): Promise<void> {
    if (!this.manager) {
      throw new Error('Shard manager not initialized');
    }

    logger.info('Respawning all shards...', {
      totalShards: this.manager.totalShards,
      delay
    });

    await this.manager.respawnAll({ shardDelay: delay, respawnDelay: delay });

    logger.info('All shards respawned successfully');
  }

  /**
   * Get total guild count across all shards
   */
  async getTotalGuilds(): Promise<number> {
    const guilds = await this.broadcastEval<number>('this.guilds.cache.size');
    return guilds.reduce((acc, count) => acc + count, 0);
  }

  /**
   * Get total user count across all shards
   */
  async getTotalUsers(): Promise<number> {
    const users = await this.broadcastEval<number>('this.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)');
    return users.reduce((acc, count) => acc + count, 0);
  }

  /**
   * Shutdown all shards gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down shard manager...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.manager) {
      // Send shutdown signal to all shards
      await this.broadcastEval('this.destroy()');

      // Give shards time to cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    logger.info('Shard manager shut down successfully');
  }

  /**
   * Get shard manager instance
   */
  getManager(): ShardingManager | null {
    return this.manager;
  }
}

// Singleton instance
let shardManager: BotShardManager | null = null;

export function initializeShardManager(config: ShardManagerConfig): BotShardManager {
  if (shardManager) {
    throw new Error('Shard manager already initialized');
  }

  shardManager = new BotShardManager(config);
  return shardManager;
}

export function getShardManager(): BotShardManager {
  if (!shardManager) {
    throw new Error('Shard manager not initialized');
  }

  return shardManager;
}
