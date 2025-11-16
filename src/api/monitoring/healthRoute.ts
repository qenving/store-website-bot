import { Router, Request, Response } from 'express';
import { healthService } from '../../core/monitoring/healthService';
import { createLogger } from '../../core/logging/logger';

const logger = createLogger({ module: 'HealthAPI' });
const router = Router();

/**
 * GET /api/monitoring/health
 * Get complete system health status
 * Public endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await healthService.getSystemHealth();

    // Set HTTP status based on system status
    const statusCode = health.status === 'ok' ? 200 : health.status === 'degraded' ? 200 : 503;

    return res.status(statusCode).json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Failed to get system health', error);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/monitoring/health/:service
 * Get health status for specific service
 * Public endpoint
 */
router.get('/health/:service', async (req: Request, res: Response) => {
  try {
    const { service } = req.params;

    const serviceHealth = await healthService.checkService(service);

    const statusCode = serviceHealth.status === 'ok' ? 200 : 503;

    return res.status(statusCode).json({
      success: true,
      data: serviceHealth
    });
  } catch (error) {
    logger.error('Failed to check service health', error);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/monitoring/health/liveness
 * Kubernetes-style liveness probe
 * Returns 200 if service is alive
 */
router.get('/liveness', async (req: Request, res: Response) => {
  return res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/monitoring/health/readiness
 * Kubernetes-style readiness probe
 * Returns 200 if service is ready to accept traffic
 */
router.get('/readiness', async (req: Request, res: Response) => {
  try {
    const health = await healthService.getSystemHealth();

    if (health.status === 'down') {
      return res.status(503).json({
        status: 'not_ready',
        reason: 'System is down',
        timestamp: new Date().toISOString()
      });
    }

    return res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Readiness check failed', error);

    return res.status(503).json({
      status: 'not_ready',
      reason: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
