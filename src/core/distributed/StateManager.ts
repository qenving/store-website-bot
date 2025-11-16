import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { createLogger } from '../logging/logger';
import { getConfig } from '../config/config';

const logger = createLogger({ module: 'StateManager' });

export interface StateOptions {
  ttl?: number; // Time to live in seconds
  watch?: boolean; // Watch for changes
}

export interface StateChange<T = any> {
  key: string;
  oldValue: T | null;
  newValue: T | null;
  timestamp: Date;
}

/**
 * Distributed State Manager
 * Manages shared state across distributed instances with change notifications
 */
export class StateManager extends EventEmitter {
  private redis: Redis;
  private watchedKeys: Set<string> = new Set();
  private pollInterval: NodeJS.Timeout | null = null;
  private stateCache: Map<string, any> = new Map();

  constructor(redis?: Redis) {
    super();

    if (redis) {
      this.redis = redis;
    } else {
      const config = getConfig().redis;
      this.redis = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        }
      });
    }
  }

  /**
   * Build state key
   */
  private buildKey(key: string): string {
    return `state:${key}`;
  }

  /**
   * Get state value
   */
  async get<T = any>(key: string): Promise<T | null> {
    const stateKey = this.buildKey(key);

    try {
      const value = await this.redis.get(stateKey);

      if (value === null) {
        return null;
      }

      const parsed = JSON.parse(value) as T;

      // Update cache if watching
      if (this.watchedKeys.has(key)) {
        this.stateCache.set(key, parsed);
      }

      return parsed;
    } catch (error) {
      logger.error(`Error getting state ${key}`, error);
      throw error;
    }
  }

  /**
   * Set state value
   */
  async set<T = any>(key: string, value: T, options: StateOptions = {}): Promise<void> {
    const stateKey = this.buildKey(key);
    const serialized = JSON.stringify(value);

    try {
      // Get old value if watching
      let oldValue: T | null = null;
      if (this.watchedKeys.has(key)) {
        oldValue = this.stateCache.get(key) || null;
      }

      // Set value
      if (options.ttl) {
        await this.redis.setex(stateKey, options.ttl, serialized);
      } else {
        await this.redis.set(stateKey, serialized);
      }

      // Update cache
      if (this.watchedKeys.has(key)) {
        this.stateCache.set(key, value);

        // Emit change event
        const change: StateChange<T> = {
          key,
          oldValue,
          newValue: value,
          timestamp: new Date()
        };

        this.emit('change', change);
        this.emit(`change:${key}`, change);
      }

      logger.debug(`State set: ${key}`, {
        ttl: options.ttl
      });
    } catch (error) {
      logger.error(`Error setting state ${key}`, error);
      throw error;
    }
  }

  /**
   * Delete state
   */
  async delete(key: string): Promise<boolean> {
    const stateKey = this.buildKey(key);

    try {
      // Get old value if watching
      let oldValue: any = null;
      if (this.watchedKeys.has(key)) {
        oldValue = this.stateCache.get(key) || null;
      }

      const result = await this.redis.del(stateKey);

      // Update cache
      if (this.watchedKeys.has(key)) {
        this.stateCache.delete(key);

        // Emit change event
        const change: StateChange = {
          key,
          oldValue,
          newValue: null,
          timestamp: new Date()
        };

        this.emit('change', change);
        this.emit(`change:${key}`, change);
      }

      logger.debug(`State deleted: ${key}`, { deleted: result === 1 });

      return result === 1;
    } catch (error) {
      logger.error(`Error deleting state ${key}`, error);
      throw error;
    }
  }

  /**
   * Check if state exists
   */
  async has(key: string): Promise<boolean> {
    const stateKey = this.buildKey(key);

    try {
      const exists = await this.redis.exists(stateKey);
      return exists === 1;
    } catch (error) {
      logger.error(`Error checking state ${key}`, error);
      throw error;
    }
  }

  /**
   * Watch key for changes
   */
  async watch(key: string): Promise<void> {
    if (this.watchedKeys.has(key)) {
      return;
    }

    // Get initial value
    const value = await this.get(key);
    this.stateCache.set(key, value);

    this.watchedKeys.add(key);

    // Start polling if not already running
    if (!this.pollInterval) {
      this.startPolling();
    }

    logger.info(`Watching state key: ${key}`);
  }

  /**
   * Stop watching key
   */
  unwatch(key: string): void {
    this.watchedKeys.delete(key);
    this.stateCache.delete(key);

    // Stop polling if no watched keys
    if (this.watchedKeys.size === 0 && this.pollInterval) {
      this.stopPolling();
    }

    logger.info(`Stopped watching state key: ${key}`);
  }

  /**
   * Start polling for changes
   */
  private startPolling(): void {
    this.pollInterval = setInterval(() => {
      this.checkForChanges().catch(error => {
        logger.error('Error checking for state changes', error);
      });
    }, 1000); // Check every second

    logger.info('Started polling for state changes');
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      logger.info('Stopped polling for state changes');
    }
  }

  /**
   * Check for changes in watched keys
   */
  private async checkForChanges(): Promise<void> {
    const promises = Array.from(this.watchedKeys).map(async (key) => {
      const currentValue = await this.get(key);
      const cachedValue = this.stateCache.get(key);

      // Compare values
      if (JSON.stringify(currentValue) !== JSON.stringify(cachedValue)) {
        const change: StateChange = {
          key,
          oldValue: cachedValue || null,
          newValue: currentValue,
          timestamp: new Date()
        };

        this.stateCache.set(key, currentValue);

        this.emit('change', change);
        this.emit(`change:${key}`, change);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Get multiple states
   */
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    const stateKeys = keys.map(k => this.buildKey(k));

    try {
      const values = await this.redis.mget(...stateKeys);

      return values.map(value => {
        if (value === null) {
          return null;
        }

        return JSON.parse(value) as T;
      });
    } catch (error) {
      logger.error('Error getting multiple states', error);
      throw error;
    }
  }

  /**
   * Set multiple states
   */
  async mset<T = any>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();

      for (const entry of entries) {
        const stateKey = this.buildKey(entry.key);
        const serialized = JSON.stringify(entry.value);

        if (entry.ttl) {
          pipeline.setex(stateKey, entry.ttl, serialized);
        } else {
          pipeline.set(stateKey, serialized);
        }
      }

      await pipeline.exec();

      logger.debug(`Multiple states set: ${entries.length} keys`);
    } catch (error) {
      logger.error('Error setting multiple states', error);
      throw error;
    }
  }

  /**
   * Increment state value
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    const stateKey = this.buildKey(key);

    try {
      const result = await this.redis.incrby(stateKey, amount);

      // Update cache if watching
      if (this.watchedKeys.has(key)) {
        this.stateCache.set(key, result);
      }

      return result;
    } catch (error) {
      logger.error(`Error incrementing state ${key}`, error);
      throw error;
    }
  }

  /**
   * Decrement state value
   */
  async decrement(key: string, amount: number = 1): Promise<number> {
    const stateKey = this.buildKey(key);

    try {
      const result = await this.redis.decrby(stateKey, amount);

      // Update cache if watching
      if (this.watchedKeys.has(key)) {
        this.stateCache.set(key, result);
      }

      return result;
    } catch (error) {
      logger.error(`Error decrementing state ${key}`, error);
      throw error;
    }
  }

  /**
   * Atomic compare and set
   */
  async compareAndSet<T = any>(key: string, expected: T, newValue: T): Promise<boolean> {
    const stateKey = this.buildKey(key);

    try {
      const script = `
        local current = redis.call("get", KEYS[1])
        if current == ARGV[1] then
          redis.call("set", KEYS[1], ARGV[2])
          return 1
        else
          return 0
        end
      `;

      const expectedStr = JSON.stringify(expected);
      const newValueStr = JSON.stringify(newValue);

      const result = await this.redis.eval(script, 1, stateKey, expectedStr, newValueStr);

      if (result === 1 && this.watchedKeys.has(key)) {
        this.stateCache.set(key, newValue);
      }

      return result === 1;
    } catch (error) {
      logger.error(`Error in compareAndSet for ${key}`, error);
      throw error;
    }
  }

  /**
   * Get all watched keys
   */
  getWatchedKeys(): string[] {
    return Array.from(this.watchedKeys);
  }

  /**
   * Get all state keys
   */
  async getAllKeys(): Promise<string[]> {
    try {
      const keys = await this.redis.keys('state:*');

      // Remove prefix
      return keys.map(k => k.replace('state:', ''));
    } catch (error) {
      logger.error('Error getting all state keys', error);
      throw error;
    }
  }

  /**
   * Clear all states
   */
  async clear(): Promise<number> {
    try {
      const keys = await this.redis.keys('state:*');

      if (keys.length === 0) {
        return 0;
      }

      const result = await this.redis.del(...keys);

      // Clear cache
      this.stateCache.clear();

      logger.info(`Cleared ${result} state keys`);

      return result;
    } catch (error) {
      logger.error('Error clearing states', error);
      throw error;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    this.stopPolling();
    await this.redis.quit();
    logger.info('State manager Redis connection closed');
  }
}

// Singleton instance
let stateManager: StateManager | null = null;

export function getStateManager(): StateManager {
  if (!stateManager) {
    stateManager = new StateManager();
  }

  return stateManager;
}

export function createStateManager(redis?: Redis): StateManager {
  return new StateManager(redis);
}
