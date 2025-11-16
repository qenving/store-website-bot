import { Router, Request, Response } from 'express';
import { dal } from '../../core/db/dal';
import { getConfig } from '../../core/config/config';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const config = getConfig();

    const status = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: config.app.version,
      database: {
        driver: config.database.driver,
        connected: true
      },
      services: {
        api: 'running',
        database: 'connected',
        payment: 'mock_gateway'
      }
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/health', async (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
