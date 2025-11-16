import { Router, Request, Response } from 'express';
import { reconcileReporter } from '../../core/reconciliation/reconcileReporter';
import { rbacMiddleware } from '../../core/rbac/rbacMiddleware';
import { Permission } from '../../core/rbac/roles';
import { createLogger } from '../../core/logging/logger';
import * as path from 'path';
import * as fs from 'fs/promises';

const logger = createLogger({ module: 'FetchReportsAPI' });
const router = Router();

/**
 * GET /api/reconciliation/reports
 * List available reconciliation reports
 * Requires: VIEW_RECONCILIATION permission
 */
router.get(
  '/reports',
  rbacMiddleware([Permission.VIEW_RECONCILIATION]),
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 30;
      const reports = await reconcileReporter.listReports(limit);

      return res.json({
        success: true,
        data: reports
      });
    } catch (error) {
      logger.error('Failed to list reports', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/reconciliation/reports/:date
 * Get specific reconciliation report by date
 * Requires: VIEW_RECONCILIATION permission
 */
router.get(
  '/reports/:date',
  rbacMiddleware([Permission.VIEW_RECONCILIATION]),
  async (req: Request, res: Response) => {
    try {
      const { date } = req.params;

      // Validate date format (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use YYYY-MM-DD'
        });
      }

      const report = await reconcileReporter.getReport(date);

      if (!report) {
        return res.status(404).json({
          success: false,
          error: 'Report not found'
        });
      }

      return res.json({
        success: true,
        data: report
      });
    } catch (error) {
      logger.error('Failed to get report', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/reconciliation/reports/:date/download
 * Download report as JSON or CSV
 * Requires: VIEW_RECONCILIATION permission
 */
router.get(
  '/reports/:date/download',
  rbacMiddleware([Permission.VIEW_RECONCILIATION]),
  async (req: Request, res: Response) => {
    try {
      const { date } = req.params;
      const format = (req.query.format as string) || 'json';

      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use YYYY-MM-DD'
        });
      }

      const reportsDir = path.join(process.cwd(), 'storage', 'reconciliation');
      let filePath: string;
      let contentType: string;
      let filename: string;

      if (format === 'csv') {
        filePath = path.join(reportsDir, `${date}_mismatches.csv`);
        contentType = 'text/csv';
        filename = `reconciliation_${date}_mismatches.csv`;
      } else {
        filePath = path.join(reportsDir, `${date}.json`);
        contentType = 'application/json';
        filename = `reconciliation_${date}.json`;
      }

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({
          success: false,
          error: `${format.toUpperCase()} report not found`
        });
      }

      // Stream file download
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const content = await fs.readFile(filePath);
      return res.send(content);
    } catch (error) {
      logger.error('Failed to download report', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/reconciliation/reports/latest
 * Get the most recent reconciliation report
 * Requires: VIEW_RECONCILIATION permission
 */
router.get(
  '/latest',
  rbacMiddleware([Permission.VIEW_RECONCILIATION]),
  async (req: Request, res: Response) => {
    try {
      const report = await reconcileReporter.getLatestReport();

      if (!report) {
        return res.status(404).json({
          success: false,
          error: 'No reports found'
        });
      }

      return res.json({
        success: true,
        data: report
      });
    } catch (error) {
      logger.error('Failed to get latest report', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * DELETE /api/reconciliation/reports/cleanup
 * Delete old reports (90+ days)
 * Requires: MANAGE_SETTINGS permission
 */
router.delete(
  '/cleanup',
  rbacMiddleware([Permission.MANAGE_SETTINGS]),
  async (req: Request, res: Response) => {
    try {
      const daysToKeep = parseInt(req.query.daysToKeep as string) || 90;

      const deletedCount = await reconcileReporter.deleteOldReports(daysToKeep);

      logger.info('Old reports cleaned up', { deletedCount, daysToKeep });

      return res.json({
        success: true,
        message: `${deletedCount} old reports deleted`,
        deletedCount
      });
    } catch (error) {
      logger.error('Failed to cleanup reports', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;
