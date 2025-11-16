import { Router, Request, Response } from 'express';
import { reconcileEngine } from '../../core/reconciliation/reconcileEngine';
import { reconcileQueue } from '../../queues/reconcileQueue';
import { rbacMiddleware } from '../../core/rbac/rbacMiddleware';
import { Permission } from '../../core/rbac/roles';
import { createLogger } from '../../core/logging/logger';

const logger = createLogger({ module: 'ManualReconcileAPI' });
const router = Router();

/**
 * POST /api/reconciliation/run
 * Trigger manual reconciliation
 * Requires: RUN_RECONCILIATION permission
 */
router.post(
  '/run',
  rbacMiddleware([Permission.RUN_RECONCILIATION]),
  async (req: Request, res: Response) => {
    try {
      const { adminId, adminUsername } = req.body;

      if (!adminId || !adminUsername) {
        return res.status(400).json({
          success: false,
          error: 'Admin ID and username required'
        });
      }

      // Check if already running
      if (reconcileEngine.isReconciliationRunning()) {
        return res.status(409).json({
          success: false,
          error: 'Reconciliation already in progress'
        });
      }

      logger.info('Manual reconciliation triggered', {
        adminId,
        adminUsername
      });

      // Add to queue (or run directly if queue not available)
      const jobId = await reconcileQueue.addReconcileJob('manual', adminUsername);

      return res.json({
        success: true,
        message: 'Reconciliation started',
        jobId
      });
    } catch (error) {
      logger.error('Failed to start reconciliation', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/reconciliation/status
 * Get current reconciliation status
 * Requires: VIEW_RECONCILIATION permission
 */
router.get(
  '/status',
  rbacMiddleware([Permission.VIEW_RECONCILIATION]),
  async (req: Request, res: Response) => {
    try {
      const currentJob = reconcileEngine.getCurrentJob();
      const isRunning = reconcileEngine.isReconciliationRunning();
      const config = reconcileEngine.getConfig();
      const queueStatus = await reconcileQueue.getQueueStatus();

      return res.json({
        success: true,
        data: {
          isRunning,
          currentJob,
          config,
          queueStatus
        }
      });
    } catch (error) {
      logger.error('Failed to get status', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * PUT /api/reconciliation/config
 * Update reconciliation configuration
 * Requires: MANAGE_SETTINGS permission
 */
router.put(
  '/config',
  rbacMiddleware([Permission.MANAGE_SETTINGS]),
  async (req: Request, res: Response) => {
    try {
      const { config } = req.body;

      if (!config) {
        return res.status(400).json({
          success: false,
          error: 'Config required'
        });
      }

      await reconcileEngine.updateConfig(config);

      logger.info('Reconciliation config updated', { config });

      return res.json({
        success: true,
        message: 'Config updated',
        config: reconcileEngine.getConfig()
      });
    } catch (error) {
      logger.error('Failed to update config', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;
