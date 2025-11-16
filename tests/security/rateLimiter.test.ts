import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter, RateLimitCategory } from '../../src/core/security/rateLimiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter();
  });

  afterEach(async () => {
    if (rateLimiter) {
      await rateLimiter.close();
    }
  });

  it('should allow requests within limit', async () => {
    const key = 'test:user:127.0.0.1';
    const config = { windowMs: 60000, maxRequests: 10 };

    const result = await rateLimiter.checkLimit(key, config);

    expect(result.remaining).toBeGreaterThanOrEqual(0);
    expect(result.limit).toBe(10);
  });

  it('should track request count', async () => {
    const key = 'test:user:127.0.0.1';
    const config = { windowMs: 60000, maxRequests: 5 };

    await rateLimiter.checkLimit(key, config);
    await rateLimiter.checkLimit(key, config);
    const result = await rateLimiter.checkLimit(key, config);

    expect(result.current).toBe(3);
  });

  it('should reset limit', async () => {
    const key = 'test:user:127.0.0.1';
    const config = { windowMs: 60000, maxRequests: 5 };

    await rateLimiter.checkLimit(key, config);
    await rateLimiter.resetLimit(key);
    const result = await rateLimiter.getStatus(key, config);

    expect(result.current).toBe(0);
  });
});
