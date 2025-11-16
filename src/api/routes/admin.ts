import { Router, Request, Response } from 'express';
import { adminController } from '../../core/admin/AdminController';
import { formatError, isAppError } from '../../core/utils/errors';
import { createLogger } from '../../core/logging/logger';

const router = Router();
const logger = createLogger({ module: 'AdminAPI' });

const validateLocalhost = (req: Request, res: Response, next: Function) => {
  const ip = req.ip || req.socket.remoteAddress;
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';

  if (!isLocal) {
    logger.warn('Unauthorized admin access attempt', { ip });
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin API can only be accessed from localhost'
      }
    });
  }

  next();
};

router.use(validateLocalhost);

router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await adminController.getBotStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Failed to get bot status', error);
    const formattedError = formatError(error);

    res.status(isAppError(error) ? error.statusCode : 500).json({
      success: false,
      error: formattedError
    });
  }
});

router.get('/pending-transactions', async (req: Request, res: Response) => {
  try {
    const count = await adminController.getPendingTransactions();

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    logger.error('Failed to get pending transactions', error);
    const formattedError = formatError(error);

    res.status(isAppError(error) ? error.statusCode : 500).json({
      success: false,
      error: formattedError
    });
  }
});

router.get('/maintenance', async (req: Request, res: Response) => {
  try {
    const mode = adminController.getMaintenanceMode();

    res.json({
      success: true,
      data: mode
    });
  } catch (error) {
    logger.error('Failed to get maintenance mode', error);
    const formattedError = formatError(error);

    res.status(isAppError(error) ? error.statusCode : 500).json({
      success: false,
      error: formattedError
    });
  }
});

router.post('/maintenance/toggle', async (req: Request, res: Response) => {
  try {
    const mode = adminController.toggleMaintenanceMode();

    logger.info('Maintenance mode toggled', { enabled: mode.enabled });

    res.json({
      success: true,
      data: mode,
      message: `Maintenance mode ${mode.enabled ? 'enabled' : 'disabled'}`
    });
  } catch (error) {
    logger.error('Failed to toggle maintenance mode', error);
    const formattedError = formatError(error);

    res.status(isAppError(error) ? error.statusCode : 500).json({
      success: false,
      error: formattedError
    });
  }
});

router.post('/maintenance', async (req: Request, res: Response) => {
  try {
    const { enabled, message } = req.body;

    const mode = adminController.setMaintenanceMode(enabled, message);

    logger.info('Maintenance mode set', { enabled, message });

    res.json({
      success: true,
      data: mode,
      message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`
    });
  } catch (error) {
    logger.error('Failed to set maintenance mode', error);
    const formattedError = formatError(error);

    res.status(isAppError(error) ? error.statusCode : 500).json({
      success: false,
      error: formattedError
    });
  }
});

router.post('/shutdown', async (req: Request, res: Response) => {
  try {
    await adminController.shutdownBot();

    res.json({
      success: true,
      message: 'Bot shutdown initiated'
    });

    setTimeout(() => {
      process.exit(0);
    }, 1000);
  } catch (error) {
    logger.error('Failed to shutdown bot', error);
    const formattedError = formatError(error);

    res.status(isAppError(error) ? error.statusCode : 500).json({
      success: false,
      error: formattedError
    });
  }
});

export default router;
