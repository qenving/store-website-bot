import { Router, Request, Response } from 'express';
import { mismatchResolver } from '../../core/reconciliation/mismatchResolver';
import { dal } from '../../core/db/dal';
import { rbacMiddleware } from '../../core/rbac/rbacMiddleware';
import { Permission } from '../../core/rbac/roles';
import { MismatchResolution } from '../../core/reconciliation/types';
import { createLogger } from '../../core/logging/logger';

const logger = createLogger({ module: 'MismatchToolsAPI' });
const router = Router();

/**
 * GET /api/reconciliation/mismatches
 * List all unresolved mismatches
 * Requires: VIEW_RECONCILIATION permission
 */
router.get(
  '/mismatches',
  rbacMiddleware([Permission.VIEW_RECONCILIATION]),
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const resolved = req.query.resolved === 'true';

      // Fetch all mismatch records from database
      const allSettings = await dal.settings.list();
      const mismatches = allSettings
        .filter(setting => setting.key.startsWith('mismatch_'))
        .map(setting => setting.value)
        .filter(mismatch => mismatch.resolved === resolved)
        .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
        .slice(0, limit);

      return res.json({
        success: true,
        data: mismatches,
        count: mismatches.length
      });
    } catch (error) {
      logger.error('Failed to list mismatches', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/reconciliation/mismatches/:id
 * Get specific mismatch details
 * Requires: VIEW_RECONCILIATION permission
 */
router.get(
  '/mismatches/:id',
  rbacMiddleware([Permission.VIEW_RECONCILIATION]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const mismatch = await dal.settings.get(`mismatch_${id}`);

      if (!mismatch) {
        return res.status(404).json({
          success: false,
          error: 'Mismatch not found'
        });
      }

      return res.json({
        success: true,
        data: mismatch
      });
    } catch (error) {
      logger.error('Failed to get mismatch', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * POST /api/reconciliation/mismatches/:id/resolve
 * Resolve a specific mismatch
 * Requires: RUN_RECONCILIATION permission
 */
router.post(
  '/mismatches/:id/resolve',
  rbacMiddleware([Permission.RUN_RECONCILIATION]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { action, adminId, adminUsername, notes } = req.body;

      if (!action || !adminId || !adminUsername) {
        return res.status(400).json({
          success: false,
          error: 'Action, admin ID, and admin username required'
        });
      }

      // Validate action
      const validActions: MismatchResolution['action'][] = [
        'sync_from_provider',
        'force_local_status',
        'mark_as_valid',
        'manual_review',
        'refund',
        'cancel'
      ];

      if (!validActions.includes(action)) {
        return res.status(400).json({
          success: false,
          error: `Invalid action. Must be one of: ${validActions.join(', ')}`
        });
      }

      // Get mismatch
      const mismatch = await dal.settings.get(`mismatch_${id}`);

      if (!mismatch) {
        return res.status(404).json({
          success: false,
          error: 'Mismatch not found'
        });
      }

      if (mismatch.resolved) {
        return res.status(400).json({
          success: false,
          error: 'Mismatch already resolved'
        });
      }

      // Resolve mismatch
      const success = await mismatchResolver.resolveMismatch(
        mismatch,
        action,
        adminId,
        adminUsername,
        notes || ''
      );

      if (!success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to resolve mismatch'
        });
      }

      logger.info('Mismatch resolved', {
        mismatchId: id,
        action,
        adminUsername
      });

      return res.json({
        success: true,
        message: 'Mismatch resolved successfully',
        mismatch
      });
    } catch (error) {
      logger.error('Failed to resolve mismatch', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * POST /api/reconciliation/mismatches/batch-resolve
 * Resolve multiple mismatches with the same action
 * Requires: RUN_RECONCILIATION permission
 */
router.post(
  '/batch-resolve',
  rbacMiddleware([Permission.RUN_RECONCILIATION]),
  async (req: Request, res: Response) => {
    try {
      const { mismatchIds, action, adminId, adminUsername, notes } = req.body;

      if (!mismatchIds || !Array.isArray(mismatchIds) || mismatchIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Mismatch IDs array required'
        });
      }

      if (!action || !adminId || !adminUsername) {
        return res.status(400).json({
          success: false,
          error: 'Action, admin ID, and admin username required'
        });
      }

      // Fetch all mismatches
      const mismatches = [];
      for (const id of mismatchIds) {
        const mismatch = await dal.settings.get(`mismatch_${id}`);
        if (mismatch && !mismatch.resolved) {
          mismatches.push(mismatch);
        }
      }

      if (mismatches.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No unresolved mismatches found'
        });
      }

      // Batch resolve
      const result = await mismatchResolver.batchResolve(
        mismatches,
        action,
        adminId,
        adminUsername,
        notes || ''
      );

      logger.info('Batch resolve completed', {
        requested: mismatchIds.length,
        success: result.success,
        failed: result.failed,
        adminUsername
      });

      return res.json({
        success: true,
        message: `Resolved ${result.success} mismatches`,
        result
      });
    } catch (error) {
      logger.error('Failed to batch resolve', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/reconciliation/mismatches/stats
 * Get mismatch statistics
 * Requires: VIEW_RECONCILIATION permission
 */
router.get(
  '/stats',
  rbacMiddleware([Permission.VIEW_RECONCILIATION]),
  async (req: Request, res: Response) => {
    try {
      // Fetch all mismatches
      const allSettings = await dal.settings.list();
      const allMismatches = allSettings
        .filter(setting => setting.key.startsWith('mismatch_'))
        .map(setting => setting.value);

      const stats = {
        total: allMismatches.length,
        resolved: allMismatches.filter(m => m.resolved).length,
        unresolved: allMismatches.filter(m => !m.resolved).length,
        byType: {} as Record<string, number>,
        bySeverity: {} as Record<string, number>,
        byProvider: {} as Record<string, number>
      };

      // Count by type, severity, provider
      for (const mismatch of allMismatches) {
        if (!mismatch.resolved) {
          stats.byType[mismatch.type] = (stats.byType[mismatch.type] || 0) + 1;
          stats.bySeverity[mismatch.severity] = (stats.bySeverity[mismatch.severity] || 0) + 1;
          stats.byProvider[mismatch.provider] = (stats.byProvider[mismatch.provider] || 0) + 1;
        }
      }

      return res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Failed to get mismatch stats', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;
