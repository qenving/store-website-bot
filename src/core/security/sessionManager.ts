import { EventEmitter } from 'events';
import { createLogger } from '../logging/logger';
import { getEncryptionService } from './encryption';
import { getSecretManager, SecretKey } from './secretManager';
import { dal } from '../db/dal';

const logger = createLogger({ module: 'SessionManager' });

export interface SessionData {
  sessionId: string;
  userId: string;
  userEmail: string;
  issuedAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  ip: string;
  userAgent: string;
  twoFactorPassed: boolean;
  deviceFingerprint?: string;
}

export interface SessionToken {
  sessionId: string;
  signature: string;
}

export interface SessionOptions {
  maxAge?: number; // milliseconds
  idleTimeout?: number; // milliseconds
  requireTwoFactor?: boolean;
}

/**
 * Session Manager for Admin Authentication
 * Manages secure session tokens with httpOnly cookies
 */
export class SessionManager extends EventEmitter {
  private encryption = getEncryptionService();
  private secretManager = getSecretManager();
  private readonly DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
  private readonly DEFAULT_IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  /**
   * Create new session
   */
  async createSession(
    userId: string,
    userEmail: string,
    ip: string,
    userAgent: string,
    options: SessionOptions = {}
  ): Promise<SessionData> {
    const sessionId = this.encryption.generateToken(32);
    const now = new Date();

    const maxAge = options.maxAge || this.DEFAULT_MAX_AGE;
    const expiresAt = new Date(now.getTime() + maxAge);

    const session: SessionData = {
      sessionId,
      userId,
      userEmail,
      issuedAt: now,
      expiresAt,
      lastActivityAt: now,
      ip,
      userAgent,
      twoFactorPassed: !options.requireTwoFactor,
      deviceFingerprint: undefined
    };

    // Save to database
    await this.saveSession(session);

    logger.info('Session created', {
      sessionId: sessionId.substring(0, 8),
      userId,
      expiresAt
    });

    this.emit('sessionCreated', session);

    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const rows = await dal.query<any>(
        'SELECT * FROM admin_sessions WHERE sessionId = ? AND expiresAt > NOW()',
        [sessionId]
      );

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];

      return {
        sessionId: row.sessionId,
        userId: row.userId,
        userEmail: row.userEmail,
        issuedAt: new Date(row.issuedAt),
        expiresAt: new Date(row.expiresAt),
        lastActivityAt: new Date(row.lastActivityAt),
        ip: row.ip,
        userAgent: row.userAgent,
        twoFactorPassed: Boolean(row.twoFactorPassed),
        deviceFingerprint: row.deviceFingerprint
      };
    } catch (error) {
      logger.error('Failed to get session', error);
      return null;
    }
  }

  /**
   * Verify session token
   */
  async verifySession(token: string): Promise<SessionData | null> {
    try {
      // Parse token
      const parsed = this.parseToken(token);

      if (!parsed) {
        return null;
      }

      // Verify signature
      const isValid = this.verifyTokenSignature(parsed.sessionId, parsed.signature);

      if (!isValid) {
        logger.warn('Invalid session token signature');
        return null;
      }

      // Get session
      const session = await this.getSession(parsed.sessionId);

      if (!session) {
        return null;
      }

      // Check idle timeout
      const idleDuration = Date.now() - session.lastActivityAt.getTime();

      if (idleDuration > this.DEFAULT_IDLE_TIMEOUT) {
        logger.warn('Session expired due to idle timeout', {
          sessionId: session.sessionId.substring(0, 8)
        });
        await this.revokeSession(session.sessionId);
        return null;
      }

      // Update last activity
      await this.updateActivity(session.sessionId);

      return session;
    } catch (error) {
      logger.error('Session verification error', error);
      return null;
    }
  }

  /**
   * Generate session token
   */
  generateToken(sessionId: string): string {
    const signature = this.signSessionId(sessionId);
    const token: SessionToken = { sessionId, signature };
    return Buffer.from(JSON.stringify(token)).toString('base64url');
  }

  /**
   * Parse session token
   */
  private parseToken(token: string): SessionToken | null {
    try {
      const json = Buffer.from(token, 'base64url').toString('utf8');
      return JSON.parse(json) as SessionToken;
    } catch (error) {
      return null;
    }
  }

  /**
   * Sign session ID
   */
  private signSessionId(sessionId: string): string {
    const key = this.secretManager.getSecret(SecretKey.SESSION_SIGNING_KEY);

    if (!key) {
      throw new Error('SESSION_SIGNING_KEY not configured');
    }

    return this.encryption.sign(sessionId, key);
  }

  /**
   * Verify token signature
   */
  private verifyTokenSignature(sessionId: string, signature: string): boolean {
    const key = this.secretManager.getSecret(SecretKey.SESSION_SIGNING_KEY);

    if (!key) {
      return false;
    }

    return this.encryption.verify(sessionId, signature, key);
  }

  /**
   * Update session 2FA status
   */
  async updateTwoFactorStatus(sessionId: string, passed: boolean): Promise<void> {
    await dal.execute(
      'UPDATE admin_sessions SET twoFactorPassed = ? WHERE sessionId = ?',
      [passed, sessionId]
    );

    logger.info('2FA status updated', {
      sessionId: sessionId.substring(0, 8),
      passed
    });
  }

  /**
   * Update last activity time
   */
  async updateActivity(sessionId: string): Promise<void> {
    await dal.execute(
      'UPDATE admin_sessions SET lastActivityAt = ? WHERE sessionId = ?',
      [new Date(), sessionId]
    );
  }

  /**
   * Revoke session
   */
  async revokeSession(sessionId: string): Promise<void> {
    await dal.execute(
      'DELETE FROM admin_sessions WHERE sessionId = ?',
      [sessionId]
    );

    logger.info('Session revoked', {
      sessionId: sessionId.substring(0, 8)
    });

    this.emit('sessionRevoked', sessionId);
  }

  /**
   * Revoke all sessions for user
   */
  async revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
    let query = 'DELETE FROM admin_sessions WHERE userId = ?';
    const params: any[] = [userId];

    if (exceptSessionId) {
      query += ' AND sessionId != ?';
      params.push(exceptSessionId);
    }

    const result = await dal.execute(query, params);

    const count = result.affectedRows || 0;

    logger.info('All sessions revoked for user', {
      userId,
      count,
      exceptCurrent: !!exceptSessionId
    });

    this.emit('allSessionsRevoked', { userId, count });

    return count;
  }

  /**
   * Get all sessions for user
   */
  async getUserSessions(userId: string): Promise<SessionData[]> {
    try {
      const rows = await dal.query<any>(
        'SELECT * FROM admin_sessions WHERE userId = ? AND expiresAt > NOW() ORDER BY lastActivityAt DESC',
        [userId]
      );

      return rows.map(row => ({
        sessionId: row.sessionId,
        userId: row.userId,
        userEmail: row.userEmail,
        issuedAt: new Date(row.issuedAt),
        expiresAt: new Date(row.expiresAt),
        lastActivityAt: new Date(row.lastActivityAt),
        ip: row.ip,
        userAgent: row.userAgent,
        twoFactorPassed: Boolean(row.twoFactorPassed),
        deviceFingerprint: row.deviceFingerprint
      }));
    } catch (error) {
      logger.error('Failed to get user sessions', error);
      return [];
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await dal.execute(
      'DELETE FROM admin_sessions WHERE expiresAt < NOW()'
    );

    const count = result.affectedRows || 0;

    if (count > 0) {
      logger.info('Expired sessions cleaned up', { count });
    }

    return count;
  }

  /**
   * Save session to database
   */
  private async saveSession(session: SessionData): Promise<void> {
    await dal.execute(
      `INSERT INTO admin_sessions
      (sessionId, userId, userEmail, issuedAt, expiresAt, lastActivityAt, ip, userAgent, twoFactorPassed, deviceFingerprint)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.sessionId,
        session.userId,
        session.userEmail,
        session.issuedAt,
        session.expiresAt,
        session.lastActivityAt,
        session.ip,
        session.userAgent,
        session.twoFactorPassed,
        session.deviceFingerprint || null
      ]
    );
  }

  /**
   * Start cleanup scheduler
   */
  startCleanupScheduler(): void {
    // Clean up expired sessions every hour
    setInterval(() => {
      this.cleanupExpiredSessions().catch(error => {
        logger.error('Session cleanup failed', error);
      });
    }, 60 * 60 * 1000);

    logger.info('Session cleanup scheduler started');
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{
    totalActiveSessions: number;
    uniqueUsers: number;
    sessionsLast24h: number;
  }> {
    try {
      const [totalResult, uniqueResult, recentResult] = await Promise.all([
        dal.query<any>('SELECT COUNT(*) as count FROM admin_sessions WHERE expiresAt > NOW()'),
        dal.query<any>('SELECT COUNT(DISTINCT userId) as count FROM admin_sessions WHERE expiresAt > NOW()'),
        dal.query<any>('SELECT COUNT(*) as count FROM admin_sessions WHERE issuedAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)')
      ]);

      return {
        totalActiveSessions: totalResult[0]?.count || 0,
        uniqueUsers: uniqueResult[0]?.count || 0,
        sessionsLast24h: recentResult[0]?.count || 0
      };
    } catch (error) {
      logger.error('Failed to get session stats', error);
      return {
        totalActiveSessions: 0,
        uniqueUsers: 0,
        sessionsLast24h: 0
      };
    }
  }
}

// Singleton instance
let sessionManager: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager();
    sessionManager.startCleanupScheduler();
  }

  return sessionManager;
}

export function createSessionManager(): SessionManager {
  return new SessionManager();
}
