import { ipcMain } from 'electron';
import { healthService } from '../../core/monitoring/healthService';
import { metricsService } from '../../core/monitoring/metricsService';
import { gatewayHealthService } from '../../core/monitoring/gatewayHealthService';
import { queueMonitor } from '../../core/monitoring/queueMonitor';
import { cronHistory } from '../../core/monitoring/cronHistory';
import { uptimeService } from '../../core/monitoring/uptimeService';
import { latencyService } from '../../core/monitoring/latencyService';
import { sentryService } from '../../core/monitoring/sentryService';
import { alertService } from '../../core/monitoring/alertService';
import { PaymentProvider } from '../../core/payments/paymentTypes';
import { createLogger } from '../../core/logging/logger';

const logger = createLogger({ module: 'MonitoringIPC' });

export function registerMonitoringIpcHandlers(): void {
  /**
   * Get system health
   */
  ipcMain.handle('monitoring:getHealth', async () => {
    try {
      const health = await healthService.getSystemHealth();
      return {
        success: true,
        data: health
      };
    } catch (error) {
      logger.error('Failed to get system health via IPC', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Get metrics (JSON format)
   */
  ipcMain.handle('monitoring:getMetrics', async () => {
    try {
      const metrics = await metricsService.getMetricsJSON();
      return {
        success: true,
        data: metrics
      };
    } catch (error) {
      logger.error('Failed to get metrics via IPC', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Get gateway health
   */
  ipcMain.handle('monitoring:getGatewayHealth', async () => {
    try {
      const gatewayHealth = gatewayHealthService.getAllGatewayHealth();

      const result: Record<string, any> = {};
      for (const [provider, health] of gatewayHealth.entries()) {
        result[provider] = health;
      }

      return {
        success: true,
        data: result
      };
    } catch (error) {
      logger.error('Failed to get gateway health via IPC', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Check specific gateway
   */
  ipcMain.handle('monitoring:checkGateway', async (event, provider: PaymentProvider) => {
    try {
      const result = await gatewayHealthService.checkGateway(provider);

      logger.info('Gateway health check triggered via IPC', { provider });

      return {
        success: true,
        data: result
      };
    } catch (error) {
      logger.error('Failed to check gateway via IPC', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Get queue stats
   */
  ipcMain.handle('monitoring:getQueueStats', async () => {
    try {
      const stats = await queueMonitor.getAllQueueStats();

      return {
        success: true,
        data: stats
      };
    } catch (error) {
      logger.error('Failed to get queue stats via IPC', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Get queue health
   */
  ipcMain.handle('monitoring:getQueueHealth', async () => {
    try {
      const health = await queueMonitor.getAllQueueHealth();

      return {
        success: true,
        data: health
      };
    } catch (error) {
      logger.error('Failed to get queue health via IPC', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Get cron stats
   */
  ipcMain.handle('monitoring:getCronStats', async () => {
    try {
      const stats = cronHistory.getAllCronStats();

      return {
        success: true,
        data: stats
      };
    } catch (error) {
      logger.error('Failed to get cron stats via IPC', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Get uptime stats
   */
  ipcMain.handle('monitoring:getUptimeStats', async () => {
    try {
      const uptimes = uptimeService.getAllUptimes();

      return {
        success: true,
        data: uptimes
      };
    } catch (error) {
      logger.error('Failed to get uptime stats via IPC', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Get latency stats
   */
  ipcMain.handle('monitoring:getLatencyStats', async () => {
    try {
      const latencyStats = latencyService.getAllLatencyStats();

      const result: Record<string, any> = {};
      for (const [service, stats] of latencyStats.entries()) {
        result[service] = stats;
      }

      return {
        success: true,
        data: result
      };
    } catch (error) {
      logger.error('Failed to get latency stats via IPC', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Get error stats
   */
  ipcMain.handle('monitoring:getErrorStats', async () => {
    try {
      const stats = sentryService.getErrorStats();

      return {
        success: true,
        data: stats
      };
    } catch (error) {
      logger.error('Failed to get error stats via IPC', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Get recent errors
   */
  ipcMain.handle('monitoring:getRecentErrors', async (event, last: number = 50) => {
    try {
      const errors = sentryService.getRecentErrors(last);

      return {
        success: true,
        data: errors
      };
    } catch (error) {
      logger.error('Failed to get recent errors via IPC', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Get alert config
   */
  ipcMain.handle('monitoring:getAlertConfig', async () => {
    try {
      const config = alertService.getConfig();

      return {
        success: true,
        data: config
      };
    } catch (error) {
      logger.error('Failed to get alert config via IPC', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Update alert config
   */
  ipcMain.handle('monitoring:updateAlertConfig', async (event, config: any) => {
    try {
      await alertService.updateConfig(config);

      logger.info('Alert config updated via IPC', { config });

      return {
        success: true,
        message: 'Alert config updated'
      };
    } catch (error) {
      logger.error('Failed to update alert config via IPC', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  logger.info('Monitoring IPC handlers registered');
}
