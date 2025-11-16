import { Router, Request, Response } from 'express';
import { uptimeService } from '../../core/monitoring/uptimeService';
import { latencyService } from '../../core/monitoring/latencyService';
import { sentryService } from '../../core/monitoring/sentryService';
import { rbacMiddleware } from '../../core/rbac/rbacMiddleware';
import { Permission } from '../../core/rbac/roles';
import { createLogger } from '../../core/logging/logger';

const logger = createLogger({ module: 'StatusAPI' });
const router = Router();

/**
 * GET /api/monitoring/status/uptime
 * Get uptime for all services
 * Requires: VIEW_DASHBOARD permission
 */
router.get(
  '/uptime',
  rbacMiddleware([Permission.VIEW_DASHBOARD]),
  async (req: Request, res: Response) => {
    try {
      const uptimes = uptimeService.getAllUptimes();

      return res.json({
        success: true,
        data: uptimes
      });
    } catch (error) {
      logger.error('Failed to get uptime', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/monitoring/status/uptime/:service
 * Get uptime for specific service
 * Requires: VIEW_DASHBOARD permission
 */
router.get(
  '/uptime/:service',
  rbacMiddleware([Permission.VIEW_DASHBOARD]),
  async (req: Request, res: Response) => {
    try {
      const { service } = req.params;

      const uptime = uptimeService.getUptimeData(service);

      if (!uptime) {
        return res.status(404).json({
          success: false,
          error: 'Service not found'
        });
      }

      return res.json({
        success: true,
        data: uptime
      });
    } catch (error) {
      logger.error('Failed to get service uptime', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/monitoring/status/latency
 * Get latency stats for all services
 * Requires: VIEW_DASHBOARD permission
 */
router.get(
  '/latency',
  rbacMiddleware([Permission.VIEW_DASHBOARD]),
  async (req: Request, res: Response) => {
    try {
      const last = parseInt(req.query.last as string) || 100;

      const latencyStats = latencyService.getAllLatencyStats();

      const result: Record<string, any> = {};
      for (const [service, stats] of latencyStats.entries()) {
        result[service] = stats;
      }

      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Failed to get latency stats', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/monitoring/status/latency/:service
 * Get latency stats for specific service
 * Requires: VIEW_DASHBOARD permission
 */
router.get(
  '/latency/:service',
  rbacMiddleware([Permission.VIEW_DASHBOARD]),
  async (req: Request, res: Response) => {
    try {
      const { service } = req.params;
      const last = parseInt(req.query.last as string) || 100;

      const stats = latencyService.getLatencyStats(service, last);

      if (!stats) {
        return res.status(404).json({
          success: false,
          error: 'No latency data for service'
        });
      }

      return res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Failed to get service latency', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/monitoring/status/errors
 * Get error tracking stats
 * Requires: VIEW_LOGS permission
 */
router.get(
  '/errors',
  rbacMiddleware([Permission.VIEW_LOGS]),
  async (req: Request, res: Response) => {
    try {
      const stats = sentryService.getErrorStats();

      return res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Failed to get error stats', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/monitoring/status/errors/recent
 * Get recent errors
 * Requires: VIEW_LOGS permission
 */
router.get(
  '/errors/recent',
  rbacMiddleware([Permission.VIEW_LOGS]),
  async (req: Request, res: Response) => {
    try {
      const last = parseInt(req.query.last as string) || 50;

      const errors = sentryService.getRecentErrors(last);

      return res.json({
        success: true,
        data: errors
      });
    } catch (error) {
      logger.error('Failed to get recent errors', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;
