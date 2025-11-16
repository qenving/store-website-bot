import { ipcMain } from 'electron';
import { reconcileEngine } from '../../core/reconciliation/reconcileEngine';
import { reconcileQueue } from '../../queues/reconcileQueue';
import { reconcileReporter } from '../../core/reconciliation/reconcileReporter';
import { mismatchResolver } from '../../core/reconciliation/mismatchResolver';
import { dal } from '../../core/db/dal';
import { createLogger } from '../../core/logging/logger';

const logger = createLogger({ module: 'ReconcileIPC' });

export function registerReconcileIpcHandlers(): void {
  /**
   * Get reconciliation status
   */
  ipcMain.handle('reconcile:getStatus', async () => {
    try {
      const currentJob = reconcileEngine.getCurrentJob();
      const isRunning = reconcileEngine.isReconciliationRunning();
      const config = reconcileEngine.getConfig();
      const queueStatus = await reconcileQueue.getQueueStatus();

      return {
        success: true,
        data: {
          isRunning,
          currentJob,
          config,
          queueStatus
        }
      };
    } catch (error) {
      logger.error('Failed to get reconciliation status', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Run manual reconciliation
   */
  ipcMain.handle('reconcile:runManual', async (event, data: { adminId: string; adminUsername: string }) => {
    try {
      if (reconcileEngine.isReconciliationRunning()) {
        return {
          success: false,
          error: 'Reconciliation already in progress'
        };
      }

      logger.info('Manual reconciliation triggered via IPC', {
        adminId: data.adminId,
        adminUsername: data.adminUsername
      });

      const jobId = await reconcileQueue.addReconcileJob('manual', data.adminUsername);

      return {
        success: true,
        message: 'Reconciliation started',
        jobId
      };
    } catch (error) {
      logger.error('Failed to run manual reconciliation', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Update reconciliation config
   */
  ipcMain.handle('reconcile:updateConfig', async (event, config: any) => {
    try {
      await reconcileEngine.updateConfig(config);

      logger.info('Reconciliation config updated via IPC', { config });

      return {
        success: true,
        message: 'Config updated',
        config: reconcileEngine.getConfig()
      };
    } catch (error) {
      logger.error('Failed to update reconciliation config', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * List reconciliation reports
   */
  ipcMain.handle('reconcile:listReports', async (event, limit: number = 30) => {
    try {
      const reports = await reconcileReporter.listReports(limit);

      return {
        success: true,
        data: reports
      };
    } catch (error) {
      logger.error('Failed to list reports', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Get specific report
   */
  ipcMain.handle('reconcile:getReport', async (event, date: string) => {
    try {
      const report = await reconcileReporter.getReport(date);

      if (!report) {
        return {
          success: false,
          error: 'Report not found'
        };
      }

      return {
        success: true,
        data: report
      };
    } catch (error) {
      logger.error('Failed to get report', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Get latest report
   */
  ipcMain.handle('reconcile:getLatestReport', async () => {
    try {
      const report = await reconcileReporter.getLatestReport();

      if (!report) {
        return {
          success: false,
          error: 'No reports found'
        };
      }

      return {
        success: true,
        data: report
      };
    } catch (error) {
      logger.error('Failed to get latest report', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * List mismatches
   */
  ipcMain.handle('reconcile:listMismatches', async (event, options: { resolved: boolean; limit: number }) => {
    try {
      const allSettings = await dal.settings.list();
      const mismatches = allSettings
        .filter(setting => setting.key.startsWith('mismatch_'))
        .map(setting => setting.value)
        .filter(mismatch => mismatch.resolved === options.resolved)
        .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
        .slice(0, options.limit);

      return {
        success: true,
        data: mismatches,
        count: mismatches.length
      };
    } catch (error) {
      logger.error('Failed to list mismatches', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Get specific mismatch
   */
  ipcMain.handle('reconcile:getMismatch', async (event, mismatchId: string) => {
    try {
      const mismatch = await dal.settings.get(`mismatch_${mismatchId}`);

      if (!mismatch) {
        return {
          success: false,
          error: 'Mismatch not found'
        };
      }

      return {
        success: true,
        data: mismatch
      };
    } catch (error) {
      logger.error('Failed to get mismatch', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Resolve mismatch
   */
  ipcMain.handle(
    'reconcile:resolveMismatch',
    async (event, data: {
      mismatchId: string;
      action: string;
      adminId: string;
      adminUsername: string;
      notes: string;
    }) => {
      try {
        const mismatch = await dal.settings.get(`mismatch_${data.mismatchId}`);

        if (!mismatch) {
          return {
            success: false,
            error: 'Mismatch not found'
          };
        }

        if (mismatch.resolved) {
          return {
            success: false,
            error: 'Mismatch already resolved'
          };
        }

        const success = await mismatchResolver.resolveMismatch(
          mismatch,
          data.action as any,
          data.adminId,
          data.adminUsername,
          data.notes
        );

        if (!success) {
          return {
            success: false,
            error: 'Failed to resolve mismatch'
          };
        }

        logger.info('Mismatch resolved via IPC', {
          mismatchId: data.mismatchId,
          action: data.action,
          adminUsername: data.adminUsername
        });

        return {
          success: true,
          message: 'Mismatch resolved successfully',
          mismatch
        };
      } catch (error) {
        logger.error('Failed to resolve mismatch', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  /**
   * Get mismatch statistics
   */
  ipcMain.handle('reconcile:getMismatchStats', async () => {
    try {
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

      for (const mismatch of allMismatches) {
        if (!mismatch.resolved) {
          stats.byType[mismatch.type] = (stats.byType[mismatch.type] || 0) + 1;
          stats.bySeverity[mismatch.severity] = (stats.bySeverity[mismatch.severity] || 0) + 1;
          stats.byProvider[mismatch.provider] = (stats.byProvider[mismatch.provider] || 0) + 1;
        }
      }

      return {
        success: true,
        data: stats
      };
    } catch (error) {
      logger.error('Failed to get mismatch stats', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  logger.info('Reconciliation IPC handlers registered');
}
