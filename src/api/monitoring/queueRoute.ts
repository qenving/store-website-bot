import { Router, Request, Response } from 'express';
import { queueMonitor } from '../../core/monitoring/queueMonitor';
import { rbacMiddleware } from '../../core/rbac/rbacMiddleware';
import { Permission } from '../../core/rbac/roles';
import { createLogger } from '../../core/logging/logger';

const logger = createLogger({ module: 'QueueMonitorAPI' });
const router = Router();

/**
 * GET /api/monitoring/queue
 * Get stats for all queues
 * Requires: VIEW_DASHBOARD permission
 */
router.get(
  '/',
  rbacMiddleware([Permission.VIEW_DASHBOARD]),
  async (req: Request, res: Response) => {
    try {
      const stats = await queueMonitor.getAllQueueStats();

      return res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Failed to get queue stats', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/monitoring/queue/:name
 * Get stats for specific queue
 * Requires: VIEW_DASHBOARD permission
 */
router.get(
  '/:name',
  rbacMiddleware([Permission.VIEW_DASHBOARD]),
  async (req: Request, res: Response) => {
    try {
      const { name } = req.params;

      const stats = await queueMonitor.getQueueStats(name);

      if (!stats) {
        return res.status(404).json({
          success: false,
          error: 'Queue not found'
        });
      }

      return res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Failed to get queue stats', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/monitoring/queue/:name/health
 * Get health status for specific queue
 * Requires: VIEW_DASHBOARD permission
 */
router.get(
  '/:name/health',
  rbacMiddleware([Permission.VIEW_DASHBOARD]),
  async (req: Request, res: Response) => {
    try {
      const { name } = req.params;

      const health = await queueMonitor.getQueueHealth(name);

      if (!health) {
        return res.status(404).json({
          success: false,
          error: 'Queue not found'
        });
      }

      return res.json({
        success: true,
        data: health
      });
    } catch (error) {
      logger.error('Failed to get queue health', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/monitoring/queue/:name/history
 * Get historical stats for specific queue
 * Requires: VIEW_DASHBOARD permission
 */
router.get(
  '/:name/history',
  rbacMiddleware([Permission.VIEW_DASHBOARD]),
  async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const last = parseInt(req.query.last as string) || 50;

      const history = queueMonitor.getQueueHistory(name, last);

      return res.json({
        success: true,
        data: history
      });
    } catch (error) {
      logger.error('Failed to get queue history', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/monitoring/queue/health/all
 * Get health status for all queues
 * Requires: VIEW_DASHBOARD permission
 */
router.get(
  '/health/all',
  rbacMiddleware([Permission.VIEW_DASHBOARD]),
  async (req: Request, res: Response) => {
    try {
      const health = await queueMonitor.getAllQueueHealth();

      return res.json({
        success: true,
        data: health
      });
    } catch (error) {
      logger.error('Failed to get all queue health', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/monitoring/queue/alerts
 * Get active queue alerts
 * Requires: VIEW_DASHBOARD permission
 */
router.get(
  '/alerts',
  rbacMiddleware([Permission.VIEW_DASHBOARD]),
  async (req: Request, res: Response) => {
    try {
      const alerts = await queueMonitor.checkForAlerts();

      return res.json({
        success: true,
        data: alerts
      });
    } catch (error) {
      logger.error('Failed to get queue alerts', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;
