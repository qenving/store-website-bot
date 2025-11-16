import { Router, Request, Response } from 'express';
import { createLogger } from '../../core/logging/logger';
import { rbacMiddleware } from '../middleware/rbac';
import { Permission } from '../../core/rbac/rbacTypes';
import { getTOTPService } from '../../core/security/totpService';

const logger = createLogger({ module: 'TOTPRoute' });
const router = Router();

const totpService = getTOTPService();

router.post('/setup', rbacMiddleware([Permission.VIEW_ADMIN_DASHBOARD]), async (req: Request, res: Response) => {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  }

  try {
    const setupData = totpService.generateSecret(user.id, 'Discord Store Bot');

    return res.json({
      success: true,
      data: setupData
    });
  } catch (error) {
    logger.error('TOTP setup failed', error);
    return res.status(500).json({ success: false, error: { code: 'SETUP_FAILED', message: 'Failed to setup 2FA' } });
  }
});

router.post('/enable', rbacMiddleware([Permission.VIEW_ADMIN_DASHBOARD]), async (req: Request, res: Response) => {
  const { secret, token, backupCodes } = req.body;
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  }

  if (!secret || !token || !backupCodes) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_DATA', message: 'Secret, token, and backup codes required' } });
  }

  try {
    const success = await totpService.enableTOTP(user.id, secret, token, backupCodes);

    if (!success) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid verification token' } });
    }

    logger.info('2FA enabled for user', { userId: user.id });

    return res.json({
      success: true,
      message: '2FA enabled successfully'
    });
  } catch (error) {
    logger.error('Failed to enable TOTP', error);
    return res.status(500).json({ success: false, error: { code: 'ENABLE_FAILED', message: 'Failed to enable 2FA' } });
  }
});

router.post('/disable', rbacMiddleware([Permission.VIEW_ADMIN_DASHBOARD]), async (req: Request, res: Response) => {
  const { token } = req.body;
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  }

  if (!token) {
    return res.status(400).json({ success: false, error: { code: 'TOKEN_REQUIRED', message: '2FA token required' } });
  }

  const isValid = await totpService.verifyUserTOTP(user.id, token);

  if (!isValid) {
    return res.status(403).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid 2FA token' } });
  }

  try {
    const success = await totpService.disableTOTP(user.id);

    if (!success) {
      return res.status(500).json({ success: false, error: { code: 'DISABLE_FAILED', message: 'Failed to disable 2FA' } });
    }

    logger.info('2FA disabled for user', { userId: user.id });

    return res.json({
      success: true,
      message: '2FA disabled successfully'
    });
  } catch (error) {
    logger.error('Failed to disable TOTP', error);
    return res.status(500).json({ success: false, error: { code: 'DISABLE_FAILED', message: 'Failed to disable 2FA' } });
  }
});

router.post('/verify', async (req: Request, res: Response) => {
  const { userId, token } = req.body;

  if (!userId || !token) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_DATA', message: 'User ID and token required' } });
  }

  try {
    const isValid = await totpService.verifyUserTOTP(userId, token);

    return res.json({
      success: true,
      data: { valid: isValid }
    });
  } catch (error) {
    logger.error('TOTP verification failed', error);
    return res.status(500).json({ success: false, error: { code: 'VERIFY_FAILED', message: 'Failed to verify token' } });
  }
});

router.post('/backup-codes/regenerate', rbacMiddleware([Permission.VIEW_ADMIN_DASHBOARD]), async (req: Request, res: Response) => {
  const { token } = req.body;
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  }

  if (!token) {
    return res.status(400).json({ success: false, error: { code: 'TOKEN_REQUIRED', message: '2FA token required' } });
  }

  const isValid = await totpService.verifyUserTOTP(user.id, token);

  if (!isValid) {
    return res.status(403).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid 2FA token' } });
  }

  try {
    const backupCodes = await totpService.regenerateBackupCodes(user.id);

    return res.json({
      success: true,
      data: { backupCodes }
    });
  } catch (error) {
    logger.error('Failed to regenerate backup codes', error);
    return res.status(500).json({ success: false, error: { code: 'REGENERATE_FAILED', message: 'Failed to regenerate backup codes' } });
  }
});

router.get('/status', rbacMiddleware([Permission.VIEW_ADMIN_DASHBOARD]), async (req: Request, res: Response) => {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  }

  try {
    const enabled = await totpService.isTOTPEnabled(user.id);

    return res.json({
      success: true,
      data: { enabled }
    });
  } catch (error) {
    logger.error('Failed to get TOTP status', error);
    return res.status(500).json({ success: false, error: { code: 'STATUS_ERROR', message: 'Failed to get 2FA status' } });
  }
});

export default router;
