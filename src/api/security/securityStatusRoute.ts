import { Router, Request, Response } from 'express';
import { createLogger } from '../../core/logging/logger';
import { rbacMiddleware } from '../middleware/rbac';
import { Permission } from '../../core/rbac/rbacTypes';
import { getSecretManager } from '../../core/security/secretManager';
import { getKeyRotationService } from '../../core/security/keyRotation';
import { getTOTPService } from '../../core/security/totpService';
import { getSessionManager } from '../../core/security/sessionManager';
import { getRateLimiter } from '../../core/security/rateLimiter';
import { dal } from '../../core/db/dal';

const logger = createLogger({ module: 'SecurityStatusRoute' });
const router = Router();

router.get('/', rbacMiddleware([Permission.VIEW_ADMIN_DASHBOARD]), async (req: Request, res: Response) => {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  }

  try {
    const secretManager = getSecretManager();
    const keyRotationService = getKeyRotationService();
    const totpService = getTOTPService();
    const sessionManager = getSessionManager();

    const [secretStats, rotationStatus, twoFactorEnabled, sessionStats, activeSessions] = await Promise.all([
      Promise.resolve(secretManager.getStats()),
      keyRotationService.getRotationStatus(),
      totpService.isTOTPEnabled(user.id),
      sessionManager.getStats(),
      sessionManager.getUserSessions(user.id)
    ]);

    return res.json({
      success: true,
      data: {
        secrets: secretStats,
        keyRotation: {
          lastRotations: rotationStatus.map(r => ({
            keyType: r.keyType,
            lastRotated: r.lastRotated,
            daysSinceRotation: r.daysSinceRotation,
            needsRotation: r.needsRotation
          }))
        },
        twoFactor: {
          enabled: twoFactorEnabled
        },
        sessions: {
          ...sessionStats,
          userActiveSessions: activeSessions.length
        }
      }
    });
  } catch (error) {
    logger.error('Failed to get security status', error);
    return res.status(500).json({ success: false, error: { code: 'STATUS_ERROR', message: 'Failed to get security status' } });
  }
});

router.get('/logs', rbacMiddleware([Permission.MANAGE_SYSTEM]), async (req: Request, res: Response) => {
  const { type, severity, limit } = req.query;

  try {
    let query = 'SELECT * FROM security_logs WHERE 1=1';
    const params: any[] = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (severity) {
      query += ' AND severity = ?';
      params.push(severity);
    }

    query += ' ORDER BY createdAt DESC LIMIT ?';
    params.push(limit ? parseInt(String(limit), 10) : 100);

    const logs = await dal.query<any>(query, params);

    return res.json({
      success: true,
      data: logs.map(log => ({
        id: log.id,
        type: log.type,
        severity: log.severity,
        message: log.message,
        metadata: JSON.parse(log.metadata || '{}'),
        createdAt: log.createdAt
      }))
    });
  } catch (error) {
    logger.error('Failed to get security logs', error);
    return res.status(500).json({ success: false, error: { code: 'LOGS_ERROR', message: 'Failed to get security logs' } });
  }
});

export default router;
