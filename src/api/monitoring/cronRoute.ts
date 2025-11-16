import { Router, Request, Response } from 'express';
import { cronHistory } from '../../core/monitoring/cronHistory';
import { rbacMiddleware } from '../../core/rbac/rbacMiddleware';
import { Permission } from '../../core/rbac/roles';
import { createLogger } from '../../core/logging/logger';

const logger = createLogger({ module: 'CronMonitorAPI' });
const router = Router();

/**
 * GET /api/monitoring/cron
 * Get stats for all cron jobs
 * Requires: VIEW_DASHBOARD permission
 */
router.get(
  '/',
  rbacMiddleware([Permission.VIEW_DASHBOARD]),
  async (req: Request, res: Response) => {
    try {
      const stats = cronHistory.getAllCronStats();

      return res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Failed to get cron stats', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/monitoring/cron/:taskName
 * Get stats for specific cron job
 * Requires: VIEW_DASHBOARD permission
 */
router.get(
  '/:taskName',
  rbacMiddleware([Permission.VIEW_DASHBOARD]),
  async (req: Request, res: Response) => {
    try {
      const { taskName } = req.params;

      const stats = cronHistory.getCronStats(taskName, '0 3 * * *');

      return res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Failed to get cron stats', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/monitoring/cron/:taskName/history
 * Get execution history for specific cron job
 * Requires: VIEW_DASHBOARD permission
 */
router.get(
  '/:taskName/history',
  rbacMiddleware([Permission.VIEW_DASHBOARD]),
  async (req: Request, res: Response) => {
    try {
      const { taskName } = req.params;
      const last = parseInt(req.query.last as string) || 50;

      const history = cronHistory.getExecutionHistory(taskName, last);

      return res.json({
        success: true,
        data: history
      });
    } catch (error) {
      logger.error('Failed to get cron history', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/monitoring/cron/:taskName/current
 * Get current execution status for cron job
 * Requires: VIEW_DASHBOARD permission
 */
router.get(
  '/:taskName/current',
  rbacMiddleware([Permission.VIEW_DASHBOARD]),
  async (req: Request, res: Response) => {
    try {
      const { taskName } = req.params;

      const currentExecution = cronHistory.getCurrentExecution(taskName);
      const isRunning = cronHistory.isRunning(taskName);

      return res.json({
        success: true,
        data: {
          isRunning,
          execution: currentExecution
        }
      });
    } catch (error) {
      logger.error('Failed to get current cron execution', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;
