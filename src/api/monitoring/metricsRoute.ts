import { Router, Request, Response } from 'express';
import { metricsService } from '../../core/monitoring/metricsService';
import { createLogger } from '../../core/logging/logger';

const logger = createLogger({ module: 'MetricsAPI' });
const router = Router();

/**
 * GET /api/monitoring/metrics
 * Get Prometheus-formatted metrics
 * Protected endpoint (token required in production)
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    // In production, check for metrics token
    if (process.env.NODE_ENV === 'production') {
      const token = req.headers.authorization?.replace('Bearer ', '');
      const expectedToken = process.env.METRICS_TOKEN;

      if (expectedToken && token !== expectedToken) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }
    }

    const metrics = await metricsService.getPrometheusMetrics();

    // Return plain text for Prometheus
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    return res.send(metrics);
  } catch (error) {
    logger.error('Failed to get metrics', error);

    return res.status(500).send('# Error generating metrics\n');
  }
});

/**
 * GET /api/monitoring/metrics/json
 * Get metrics in JSON format
 * Protected endpoint
 */
router.get('/metrics/json', async (req: Request, res: Response) => {
  try {
    // In production, check for metrics token
    if (process.env.NODE_ENV === 'production') {
      const token = req.headers.authorization?.replace('Bearer ', '');
      const expectedToken = process.env.METRICS_TOKEN;

      if (expectedToken && token !== expectedToken) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }
    }

    const metrics = await metricsService.getMetricsJSON();

    return res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Failed to get JSON metrics', error);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
