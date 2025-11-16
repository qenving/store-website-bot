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
