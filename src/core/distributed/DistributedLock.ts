import { Redis } from 'ioredis';
import { createLogger } from '../logging/logger';
import { getConfig } from '../config/config';

const logger = createLogger({ module: 'DistributedLock' });

export interface LockOptions {
  ttl?: number; // Time to live in milliseconds
  retries?: number; // Number of retries
  retryDelay?: number; // Delay between retries in ms
}

export interface LockInfo {
  resource: string;
  value: string;
  acquiredAt: Date;
  expiresAt: Date;
}

/**
 * Redis-based Distributed Lock
 * Implements distributed locking using Redis for coordination across multiple processes/instances
 */
export class DistributedLock {
  private redis: Redis;
  private locks: Map<string, LockInfo> = new Map();

  constructor(redis?: Redis) {
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
   * Acquire a distributed lock
   */
  async acquire(
    resource: string,
    options: LockOptions = {}
  ): Promise<string | null> {
    const {
      ttl = 30000, // 30 seconds default
      retries = 3,
      retryDelay = 100
    } = options;

    const lockKey = `lock:${resource}`;
    const lockValue = this.generateLockValue();

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Try to acquire lock using SET with NX and PX options
        const result = await this.redis.set(
          lockKey,
          lockValue,
          'PX',
          ttl,
          'NX'
        );

        if (result === 'OK') {
          const now = new Date();
          const lockInfo: LockInfo = {
            resource,
            value: lockValue,
            acquiredAt: now,
            expiresAt: new Date(now.getTime() + ttl)
          };

          this.locks.set(resource, lockInfo);

          logger.debug(`Lock acquired for resource: ${resource}`, {
            lockValue,
            ttl,
            attempt
          });

          return lockValue;
        }

        // Lock not acquired, wait before retry
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      } catch (error) {
        logger.error(`Error acquiring lock for ${resource}`, error);

        if (attempt === retries) {
          throw error;
        }
      }
    }

    logger.warn(`Failed to acquire lock for ${resource} after ${retries} retries`);
    return null;
  }

  /**
   * Release a distributed lock
   */
  async release(resource: string, lockValue: string): Promise<boolean> {
    const lockKey = `lock:${resource}`;

    try {
      // Use Lua script to ensure atomic check and delete
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(script, 1, lockKey, lockValue);

      if (result === 1) {
        this.locks.delete(resource);

        logger.debug(`Lock released for resource: ${resource}`, {
          lockValue
        });

        return true;
      }

      logger.warn(`Failed to release lock for ${resource}: value mismatch`, {
        lockValue
      });

      return false;
    } catch (error) {
      logger.error(`Error releasing lock for ${resource}`, error);
      throw error;
    }
  }

  /**
   * Extend lock TTL
   */
  async extend(resource: string, lockValue: string, additionalTtl: number): Promise<boolean> {
    const lockKey = `lock:${resource}`;

    try {
      // Use Lua script to check value and extend TTL atomically
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(script, 1, lockKey, lockValue, additionalTtl);

      if (result === 1) {
        const lockInfo = this.locks.get(resource);
        if (lockInfo) {
          lockInfo.expiresAt = new Date(Date.now() + additionalTtl);
          this.locks.set(resource, lockInfo);
        }

        logger.debug(`Lock extended for resource: ${resource}`, {
          lockValue,
          additionalTtl
        });

        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error extending lock for ${resource}`, error);
      throw error;
    }
  }

  /**
   * Check if lock exists
   */
  async isLocked(resource: string): Promise<boolean> {
    const lockKey = `lock:${resource}`;

    try {
      const exists = await this.redis.exists(lockKey);
      return exists === 1;
    } catch (error) {
      logger.error(`Error checking lock for ${resource}`, error);
      throw error;
    }
  }

  /**
   * Get lock info
   */
  async getLockInfo(resource: string): Promise<{ value: string; ttl: number } | null> {
    const lockKey = `lock:${resource}`;

    try {
      const [value, ttl] = await Promise.all([
        this.redis.get(lockKey),
        this.redis.pttl(lockKey)
      ]);

      if (value && ttl > 0) {
        return { value, ttl };
      }

      return null;
    } catch (error) {
      logger.error(`Error getting lock info for ${resource}`, error);
      throw error;
    }
  }

  /**
   * Execute function with lock
   */
  async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T> {
    const lockValue = await this.acquire(resource, options);

    if (!lockValue) {
      throw new Error(`Failed to acquire lock for resource: ${resource}`);
    }

    try {
      const result = await fn();
      return result;
    } finally {
      await this.release(resource, lockValue);
    }
  }

  /**
   * Generate unique lock value
   */
  private generateLockValue(): string {
    return `${process.pid}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get all active locks
   */
  getActiveLocks(): LockInfo[] {
    return Array.from(this.locks.values());
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
    logger.info('Distributed lock Redis connection closed');
  }
}

// Singleton instance
let distributedLock: DistributedLock | null = null;

export function getDistributedLock(): DistributedLock {
  if (!distributedLock) {
    distributedLock = new DistributedLock();
  }

  return distributedLock;
}

export function createDistributedLock(redis?: Redis): DistributedLock {
  return new DistributedLock(redis);
}
