import { describe, it, expect } from 'vitest';
import { KeyRotationService } from '../../src/core/security/keyRotation';

describe('KeyRotationService', () => {
  const keyRotationService = new KeyRotationService();

  it('should create key rotation service', () => {
    expect(keyRotationService).toBeDefined();
  });

  it('should get rotation status', async () => {
    const status = await keyRotationService.getRotationStatus();
    expect(Array.isArray(status)).toBe(true);
  });

  it('should check rotation needed', async () => {
    const needed = await keyRotationService.checkRotationNeeded('JWT_SECRET' as any);
    expect(typeof needed).toBe('boolean');
  });
});
