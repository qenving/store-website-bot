import { describe, it, expect } from 'vitest';
import { SessionManager } from '../../src/core/security/sessionManager';

describe('SessionManager', () => {
  const sessionManager = new SessionManager();

  it('should create session manager', () => {
    expect(sessionManager).toBeDefined();
  });

  it('should generate session token', () => {
    const sessionId = 'test-session-123';
    const token = sessionManager.generateToken(sessionId);

    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThan(0);
  });

  it('should get session stats', async () => {
    const stats = await sessionManager.getStats();

    expect(stats).toHaveProperty('totalActiveSessions');
    expect(stats).toHaveProperty('uniqueUsers');
    expect(stats).toHaveProperty('sessionsLast24h');
  });
});
