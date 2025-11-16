import { Router, Request, Response } from 'express';
import { createLogger } from '../../core/logging/logger';
import { rbacMiddleware } from '../middleware/rbac';
import { Permission } from '../../core/rbac/rbacTypes';
import { getKeyRotationService, KeyType } from '../../core/security/keyRotation';
import { getTOTPService } from '../../core/security/totpService';

const logger = createLogger({ module: 'RotateKeysRoute' });
const router = Router();

const keyRotationService = getKeyRotationService();
const totpService = getTOTPService();

router.get('/status', rbacMiddleware([Permission.MANAGE_SYSTEM]), async (req: Request, res: Response) => {
  try {
    const status = await keyRotationService.getRotationStatus();

    return res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Failed to get rotation status', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'ROTATION_STATUS_ERROR',
        message: 'Failed to get rotation status'
      }
    });
  }
});

router.post('/jwt', rbacMiddleware([Permission.MANAGE_SYSTEM]), async (req: Request, res: Response) => {
  const { totpToken } = req.body;
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized'
      }
    });
  }

  if (!totpToken) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'TOTP_REQUIRED',
        message: '2FA token required for key rotation'
      }
    });
  }

  const isValid = await totpService.verifyUserTOTP(user.id, totpToken);

  if (!isValid) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'INVALID_TOTP',
        message: 'Invalid 2FA token'
      }
    });
  }

  try {
    const record = await keyRotationService.rotateJWTSecret(user.id, user.email);

    logger.info('JWT secret rotated', {
      adminId: user.id,
      recordId: record.id
    });

    return res.json({
      success: true,
      data: {
        rotatedAt: record.rotatedAt,
        gracePeriodEnd: record.gracePeriodEnd
      }
    });
  } catch (error) {
    logger.error('JWT rotation failed', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'ROTATION_FAILED',
        message: 'Failed to rotate JWT secret'
      }
    });
  }
});

router.post('/session', rbacMiddleware([Permission.MANAGE_SYSTEM]), async (req: Request, res: Response) => {
  const { totpToken, forceLogout } = req.body;
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  }

  if (!totpToken) {
    return res.status(400).json({ success: false, error: { code: 'TOTP_REQUIRED', message: '2FA token required' } });
  }

  const isValid = await totpService.verifyUserTOTP(user.id, totpToken);

  if (!isValid) {
    return res.status(403).json({ success: false, error: { code: 'INVALID_TOTP', message: 'Invalid 2FA token' } });
  }

  try {
    const record = await keyRotationService.rotateSessionKey(user.id, user.email, { forceLogout });

    return res.json({
      success: true,
      data: {
        rotatedAt: record.rotatedAt,
        forceLogout: forceLogout || false
      }
    });
  } catch (error) {
    logger.error('Session key rotation failed', error);
    return res.status(500).json({ success: false, error: { code: 'ROTATION_FAILED', message: 'Failed to rotate session key' } });
  }
});

router.post('/gateway/:gateway', rbacMiddleware([Permission.MANAGE_GATEWAYS]), async (req: Request, res: Response) => {
  const { gateway } = req.params;
  const { newKey, totpToken } = req.body;
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  }

  if (!newKey) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_KEY', message: 'New API key required' } });
  }

  if (!totpToken) {
    return res.status(400).json({ success: false, error: { code: 'TOTP_REQUIRED', message: '2FA token required' } });
  }

  const isValid = await totpService.verifyUserTOTP(user.id, totpToken);

  if (!isValid) {
    return res.status(403).json({ success: false, error: { code: 'INVALID_TOTP', message: 'Invalid 2FA token' } });
  }

  try {
    const record = await keyRotationService.rotateGatewayKey(gateway, newKey, user.id, user.email);

    return res.json({
      success: true,
      data: {
        gateway,
        rotatedAt: record.rotatedAt
      }
    });
  } catch (error) {
    logger.error('Gateway key rotation failed', error);
    return res.status(500).json({ success: false, error: { code: 'ROTATION_FAILED', message: 'Failed to rotate gateway key' } });
  }
});

router.get('/history', rbacMiddleware([Permission.MANAGE_SYSTEM]), async (req: Request, res: Response) => {
  const { keyType, limit } = req.query;

  try {
    const history = await keyRotationService.getRotationHistory(
      keyType as KeyType | undefined,
      limit ? parseInt(String(limit), 10) : 50
    );

    return res.json({
      success: true,
      data: history
    });
  } catch (error) {
    logger.error('Failed to get rotation history', error);
    return res.status(500).json({ success: false, error: { code: 'HISTORY_ERROR', message: 'Failed to get rotation history' } });
  }
});

export default router;
