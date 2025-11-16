import { Router, Request, Response } from 'express';
import { createLogger } from '../../core/logging/logger';
import { rbacMiddleware } from '../middleware/rbac';
import { Permission } from '../../core/rbac/rbacTypes';
import { getSessionManager } from '../../core/security/sessionManager';

const logger = createLogger({ module: 'SessionRoute' });
const router = Router();

const sessionManager = getSessionManager();

router.get('/active', rbacMiddleware([Permission.VIEW_ADMIN_DASHBOARD]), async (req: Request, res: Response) => {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  }

  try {
    const sessions = await sessionManager.getUserSessions(user.id);

    const sanitizedSessions = sessions.map(s => ({
      sessionId: s.sessionId.substring(0, 12) + '...',
      issuedAt: s.issuedAt,
      expiresAt: s.expiresAt,
      lastActivityAt: s.lastActivityAt,
      ip: s.ip,
      userAgent: s.userAgent,
      twoFactorPassed: s.twoFactorPassed,
      isCurrent: s.sessionId === (req as any).sessionId
    }));

    return res.json({
      success: true,
      data: sanitizedSessions
    });
  } catch (error) {
    logger.error('Failed to get active sessions', error);
    return res.status(500).json({ success: false, error: { code: 'SESSIONS_ERROR', message: 'Failed to get active sessions' } });
  }
});

router.delete('/:sessionId', rbacMiddleware([Permission.VIEW_ADMIN_DASHBOARD]), async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  }

  if (sessionId === (req as any).sessionId) {
    return res.status(400).json({ success: false, error: { code: 'CANNOT_REVOKE_CURRENT', message: 'Cannot revoke current session' } });
  }

  try {
    await sessionManager.revokeSession(sessionId);

    logger.info('Session revoked', { userId: user.id, sessionId: sessionId.substring(0, 8) });

    return res.json({
      success: true,
      message: 'Session revoked successfully'
    });
  } catch (error) {
    logger.error('Failed to revoke session', error);
    return res.status(500).json({ success: false, error: { code: 'REVOKE_FAILED', message: 'Failed to revoke session' } });
  }
});

router.delete('/all/except-current', rbacMiddleware([Permission.VIEW_ADMIN_DASHBOARD]), async (req: Request, res: Response) => {
  const user = (req as any).user;
  const currentSessionId = (req as any).sessionId;

  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  }

  try {
    const count = await sessionManager.revokeAllSessions(user.id, currentSessionId);

    logger.info('All other sessions revoked', { userId: user.id, count });

    return res.json({
      success: true,
      data: { revokedCount: count }
    });
  } catch (error) {
    logger.error('Failed to revoke all sessions', error);
    return res.status(500).json({ success: false, error: { code: 'REVOKE_ALL_FAILED', message: 'Failed to revoke sessions' } });
  }
});

router.get('/stats', rbacMiddleware([Permission.MANAGE_SYSTEM]), async (req: Request, res: Response) => {
  try {
    const stats = await sessionManager.getStats();

    return res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get session stats', error);
    return res.status(500).json({ success: false, error: { code: 'STATS_ERROR', message: 'Failed to get session stats' } });
  }
});

export default router;
