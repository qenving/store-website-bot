import { Redis } from 'ioredis';
import { createLogger } from '../logging/logger';
import { getConfig } from '../config/config';

const logger = createLogger({ module: 'DistributedCache' });

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
}

/**
 * Redis-based Distributed Cache
 * Shared cache across multiple instances for improved performance and consistency
 */
export class DistributedCache {
  private redis: Redis;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    hitRate: 0
  };
  private defaultNamespace: string = 'cache';

  constructor(redis?: Redis, namespace?: string) {
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

    if (namespace) {
      this.defaultNamespace = namespace;
    }
  }

  /**
   * Build cache key with namespace
   */
  private buildKey(key: string, namespace?: string): string {
    const ns = namespace || this.defaultNamespace;
    return `${ns}:${key}`;
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const cacheKey = this.buildKey(key, options.namespace);

    try {
      const value = await this.redis.get(cacheKey);

      if (value === null) {
        this.stats.misses++;
        this.updateHitRate();

        logger.debug(`Cache miss: ${cacheKey}`);
        return null;
      }

      this.stats.hits++;
      this.updateHitRate();

      logger.debug(`Cache hit: ${cacheKey}`);

      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Error getting cache key ${cacheKey}`, error);
      throw error;
    }
  }

  /**
   * Set value in cache
   */
  async set<T = any>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const cacheKey = this.buildKey(key, options.namespace);
    const serialized = JSON.stringify(value);

    try {
      if (options.ttl) {
        await this.redis.setex(cacheKey, options.ttl, serialized);
      } else {
        await this.redis.set(cacheKey, serialized);
      }

      this.stats.sets++;

      logger.debug(`Cache set: ${cacheKey}`, {
        ttl: options.ttl
      });
    } catch (error) {
      logger.error(`Error setting cache key ${cacheKey}`, error);
      throw error;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string, options: CacheOptions = {}): Promise<boolean> {
    const cacheKey = this.buildKey(key, options.namespace);

    try {
      const result = await this.redis.del(cacheKey);

      this.stats.deletes++;

      logger.debug(`Cache delete: ${cacheKey}`, { deleted: result === 1 });

      return result === 1;
    } catch (error) {
      logger.error(`Error deleting cache key ${cacheKey}`, error);
      throw error;
    }
  }

  /**
   * Check if key exists
   */
  async has(key: string, options: CacheOptions = {}): Promise<boolean> {
    const cacheKey = this.buildKey(key, options.namespace);

    try {
      const exists = await this.redis.exists(cacheKey);
      return exists === 1;
    } catch (error) {
      logger.error(`Error checking cache key ${cacheKey}`, error);
      throw error;
    }
  }

  /**
   * Get multiple values
   */
  async mget<T = any>(keys: string[], options: CacheOptions = {}): Promise<(T | null)[]> {
    const cacheKeys = keys.map(k => this.buildKey(k, options.namespace));

    try {
      const values = await this.redis.mget(...cacheKeys);

      return values.map((value, index) => {
        if (value === null) {
          this.stats.misses++;
          return null;
        }

        this.stats.hits++;
        return JSON.parse(value) as T;
      });
    } catch (error) {
      logger.error('Error getting multiple cache keys', error);
      throw error;
    } finally {
      this.updateHitRate();
    }
  }

  /**
   * Set multiple values
   */
  async mset<T = any>(entries: Array<{ key: string; value: T; ttl?: number }>, options: CacheOptions = {}): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();

      for (const entry of entries) {
        const cacheKey = this.buildKey(entry.key, options.namespace);
        const serialized = JSON.stringify(entry.value);

        if (entry.ttl) {
          pipeline.setex(cacheKey, entry.ttl, serialized);
        } else {
          pipeline.set(cacheKey, serialized);
        }

        this.stats.sets++;
      }

      await pipeline.exec();

      logger.debug(`Cache mset: ${entries.length} keys`);
    } catch (error) {
      logger.error('Error setting multiple cache keys', error);
      throw error;
    }
  }

  /**
   * Get or set pattern - fetch from cache or compute and cache
   */
  async getOrSet<T = any>(
    key: string,
    factory: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key, options);

    if (cached !== null) {
      return cached;
    }

    // Compute value
    const value = await factory();

    // Store in cache
    await this.set(key, value, options);

    return value;
  }

  /**
   * Increment value
   */
  async increment(key: string, amount: number = 1, options: CacheOptions = {}): Promise<number> {
    const cacheKey = this.buildKey(key, options.namespace);

    try {
      const result = await this.redis.incrby(cacheKey, amount);

      // Set TTL if specified
      if (options.ttl) {
        await this.redis.expire(cacheKey, options.ttl);
      }

      return result;
    } catch (error) {
      logger.error(`Error incrementing cache key ${cacheKey}`, error);
      throw error;
    }
  }

  /**
   * Decrement value
   */
  async decrement(key: string, amount: number = 1, options: CacheOptions = {}): Promise<number> {
    const cacheKey = this.buildKey(key, options.namespace);

    try {
      const result = await this.redis.decrby(cacheKey, amount);

      // Set TTL if specified
      if (options.ttl) {
        await this.redis.expire(cacheKey, options.ttl);
      }

      return result;
    } catch (error) {
      logger.error(`Error decrementing cache key ${cacheKey}`, error);
      throw error;
    }
  }

  /**
   * Get TTL for key
   */
  async getTTL(key: string, options: CacheOptions = {}): Promise<number> {
    const cacheKey = this.buildKey(key, options.namespace);

    try {
      const ttl = await this.redis.ttl(cacheKey);
      return ttl;
    } catch (error) {
      logger.error(`Error getting TTL for ${cacheKey}`, error);
      throw error;
    }
  }

  /**
   * Set TTL for existing key
   */
  async setTTL(key: string, ttl: number, options: CacheOptions = {}): Promise<boolean> {
    const cacheKey = this.buildKey(key, options.namespace);

    try {
      const result = await this.redis.expire(cacheKey, ttl);
      return result === 1;
    } catch (error) {
      logger.error(`Error setting TTL for ${cacheKey}`, error);
      throw error;
    }
  }

  /**
   * Clear all keys in namespace
   */
  async clear(namespace?: string): Promise<number> {
    const ns = namespace || this.defaultNamespace;
    const pattern = `${ns}:*`;

    try {
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      const result = await this.redis.del(...keys);

      logger.info(`Cleared ${result} keys from namespace: ${ns}`);

      return result;
    } catch (error) {
      logger.error(`Error clearing namespace ${ns}`, error);
      throw error;
    }
  }

  /**
   * Get all keys in namespace
   */
  async keys(pattern: string = '*', namespace?: string): Promise<string[]> {
    const ns = namespace || this.defaultNamespace;
    const searchPattern = `${ns}:${pattern}`;

    try {
      const keys = await this.redis.keys(searchPattern);

      // Remove namespace prefix
      return keys.map(k => k.replace(`${ns}:`, ''));
    } catch (error) {
      logger.error(`Error getting keys for pattern ${searchPattern}`, error);
      throw error;
    }
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;

    if (total > 0) {
      this.stats.hitRate = (this.stats.hits / total) * 100;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0
    };
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
    logger.info('Distributed cache Redis connection closed');
  }
}

// Singleton instance
let distributedCache: DistributedCache | null = null;

export function getDistributedCache(namespace?: string): DistributedCache {
  if (!distributedCache) {
    distributedCache = new DistributedCache(undefined, namespace);
  }

  return distributedCache;
}

export function createDistributedCache(redis?: Redis, namespace?: string): DistributedCache {
  return new DistributedCache(redis, namespace);
}
