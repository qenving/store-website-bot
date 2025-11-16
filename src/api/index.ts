import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { getConfig } from '../core/config/config';
import { createLogger } from '../core/logging/logger';
import { dal } from '../core/db/dal';
import statusRoutes from './routes/status';
import transactionsRoutes from './routes/transactions';
import webhookRoutes from './routes/webhook';
import adminRoutes from './routes/admin';
import healthRoute from './monitoring/healthRoute';
import metricsRoute from './monitoring/metricsRoute';
import statusMonitoringRoute from './monitoring/statusRoute';
import gatewayRoute from './monitoring/gatewayRoute';
import queueRoute from './monitoring/queueRoute';
import cronRoute from './monitoring/cronRoute';
import { uptimeService } from '../core/monitoring/uptimeService';
import { gatewayHealthService } from '../core/monitoring/gatewayHealthService';
import { queueMonitor } from '../core/monitoring/queueMonitor';

const logger = createLogger({ module: 'API' });

export async function startAPIServer(): Promise<void> {
  const config = getConfig();
  const app = express();

  app.use(cors());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.debug(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    next();
  });

  app.use('/internal/status', statusRoutes);
  app.use('/internal/transactions', transactionsRoutes);
  app.use('/internal/admin', adminRoutes);
  app.use('/internal', webhookRoutes);

  // Monitoring routes
  app.use('/api/monitoring/health', healthRoute);
  app.use('/api/monitoring/metrics', metricsRoute);
  app.use('/api/monitoring/status', statusMonitoringRoute);
  app.use('/api/monitoring/gateway', gatewayRoute);
  app.use('/api/monitoring/queue', queueRoute);
  app.use('/api/monitoring/cron', cronRoute);

  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error in API', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred'
      }
    });
  });

  await dal.initialize();

  // Initialize monitoring services
  logger.info('Initializing monitoring services...');

  // Register API service uptime
  uptimeService.registerService('api');

  // Initialize gateway health monitoring (5-minute interval checks)
  gatewayHealthService.startPeriodicChecks();
  logger.info('Gateway health monitoring started');

  // Initialize queue monitoring
  await queueMonitor.initialize();
  logger.info('Queue monitoring initialized');

  logger.info('Monitoring services initialized successfully');

  return new Promise((resolve) => {
    app.listen(config.api.port, config.api.host, () => {
      logger.info(`Internal API server started`, {
        host: config.api.host,
        port: config.api.port
      });
      resolve();
    });
  });
}
