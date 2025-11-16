import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { createLogger } from '../logging/logger';
import { getConfig } from '../config/config';
import { dal } from '../db/dal';

const logger = createLogger({ module: 'RateLimiter' });

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: Date;
}

export enum RateLimitCategory {
  PUBLIC_STORE = 'public_store',
  AUTH = 'auth',
  ADMIN = 'admin',
  WEBHOOK = 'webhook',
  API_INTERNAL = 'api_internal'
}

const RATE_LIMIT_CONFIGS: Record<RateLimitCategory, RateLimitConfig> = {
  [RateLimitCategory.PUBLIC_STORE]: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100 // 100 requests per minute per IP
  },
  [RateLimitCategory.AUTH]: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5 // 5 login attempts per 15 minutes
  },
  [RateLimitCategory.ADMIN]: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60 // 60 requests per minute per admin + IP
  },
  [RateLimitCategory.WEBHOOK]: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30 // 30 webhook requests per minute
  },
  [RateLimitCategory.API_INTERNAL]: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000 // 1000 requests per minute for internal API
  }
};

/**
 * Rate Limiter using Redis
 * Implements sliding window rate limiting
 */
export class RateLimiter {
  private redis: Redis;

  constructor() {
    const config = getConfig().redis;
    this.redis = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db
    });
  }

  /**
   * Create rate limit middleware
   */
  createMiddleware(category: RateLimitCategory, customConfig?: Partial<RateLimitConfig>) {
    const config = {
      ...RATE_LIMIT_CONFIGS[category],
      ...customConfig
    };

    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const key = this.generateKey(category, req, config);

        const result = await this.checkLimit(key, config);

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', result.limit);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', result.resetTime.getTime());

        if (result.remaining < 0) {
          // Rate limit exceeded
          await this.logRateLimitExceeded(category, req, key);

          return res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests, please try again later',
              retryAfter: Math.ceil((result.resetTime.getTime() - Date.now()) / 1000)
            }
          });
        }

        next();
      } catch (error) {
        logger.error('Rate limiter error', error);
        // On error, allow request through
        next();
      }
    };
  }

  /**
   * Check rate limit
   */
  async checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitInfo> {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Remove old entries
    await this.redis.zremrangebyscore(key, 0, windowStart);

    // Count requests in window
    const count = await this.redis.zcard(key);

    // Add current request
    await this.redis.zadd(key, now, `${now}-${Math.random()}`);

    // Set expiry
    await this.redis.pexpire(key, config.windowMs);

    const remaining = Math.max(0, config.maxRequests - count - 1);
    const resetTime = new Date(now + config.windowMs);

    return {
      limit: config.maxRequests,
      current: count + 1,
      remaining,
      resetTime
    };
  }

  /**
   * Reset rate limit for key
   */
  async resetLimit(key: string): Promise<void> {
    await this.redis.del(key);
    logger.info('Rate limit reset', { key });
  }

  /**
   * Get current rate limit status
   */
  async getStatus(key: string, config: RateLimitConfig): Promise<RateLimitInfo> {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Count requests in window (without adding new)
    const count = await this.redis.zcount(key, windowStart, now);

    const remaining = Math.max(0, config.maxRequests - count);
    const resetTime = new Date(now + config.windowMs);

    return {
      limit: config.maxRequests,
      current: count,
      remaining,
      resetTime
    };
  }

  /**
   * Generate rate limit key
   */
  private generateKey(category: RateLimitCategory, req: Request, config: RateLimitConfig): string {
    let identifier: string;

    if (config.keyGenerator) {
      identifier = config.keyGenerator(req);
    } else {
      // Default key generation
      if (category === RateLimitCategory.ADMIN) {
        // Admin: userId + IP
        const userId = (req as any).user?.id || 'anonymous';
        const ip = this.getClientIp(req);
        identifier = `${userId}:${ip}`;
      } else if (category === RateLimitCategory.AUTH) {
        // Auth: IP only
        identifier = this.getClientIp(req);
      } else {
        // Others: IP
        identifier = this.getClientIp(req);
      }
    }

    return `ratelimit:${category}:${identifier}`;
  }

  /**
   * Get client IP address
   */
  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];

    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }

    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  /**
   * Log rate limit exceeded
   */
  private async logRateLimitExceeded(category: RateLimitCategory, req: Request, key: string): Promise<void> {
    const ip = this.getClientIp(req);

    logger.warn('Rate limit exceeded', {
      category,
      key,
      ip,
      path: req.path,
      method: req.method
    });

    // Save to security logs
    try {
      await dal.execute(
        `INSERT INTO security_logs
        (type, severity, message, metadata, createdAt)
        VALUES (?, ?, ?, ?, ?)`,
        [
          'rate_limit',
          'medium',
          `Rate limit exceeded for ${category}`,
          JSON.stringify({
            category,
            ip,
            path: req.path,
            method: req.method,
            userAgent: req.headers['user-agent']
          }),
          new Date()
        ]
      );
    } catch (error) {
      logger.error('Failed to log rate limit event', error);
    }
  }

  /**
   * Get rate limit statistics
   */
  async getStats(category: RateLimitCategory): Promise<{
    category: RateLimitCategory;
    activeKeys: number;
    config: RateLimitConfig;
  }> {
    const pattern = `ratelimit:${category}:*`;
    const keys = await this.redis.keys(pattern);

    return {
      category,
      activeKeys: keys.length,
      config: RATE_LIMIT_CONFIGS[category]
    };
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

// Singleton instance
let rateLimiter: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!rateLimiter) {
    rateLimiter = new RateLimiter();
  }

  return rateLimiter;
}

export function createRateLimiter(): RateLimiter {
  return new RateLimiter();
}
