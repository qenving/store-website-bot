import express, { Request, Response, NextFunction } from 'express';
import * as path from 'path';
import cors from 'cors';
import bodyParser from 'body-parser';
import { getConfig } from '../core/config/config';
import { createLogger } from '../core/logging/logger';
import { dal } from '../core/db/dal';
import storeRoutes from './routes/store';

const logger = createLogger({ module: 'Website' });

export async function startWebsite(): Promise<void> {
  const config = getConfig();
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

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

  app.get('/', (req: Request, res: Response) => {
    res.redirect('/store/products');
  });

  app.use('/store', storeRoutes);

  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error in website', err);
    res.status(500).send('Internal Server Error');
  });

  await dal.initialize();

  return new Promise((resolve) => {
    app.listen(config.website.port, config.website.host, () => {
      logger.info(`Website server started`, {
        host: config.website.host,
        port: config.website.port,
        url: `http://${config.website.host}:${config.website.port}`
      });
      resolve();
    });
  });
}
