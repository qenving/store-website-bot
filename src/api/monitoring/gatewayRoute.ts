import { Router, Request, Response } from 'express';
import { gatewayHealthService } from '../../core/monitoring/gatewayHealthService';
import { PaymentProvider } from '../../core/payments/paymentTypes';
import { rbacMiddleware } from '../../core/rbac/rbacMiddleware';
import { Permission } from '../../core/rbac/roles';
import { createLogger } from '../../core/logging/logger';

const logger = createLogger({ module: 'GatewayHealthAPI' });
const router = Router();

/**
 * GET /api/monitoring/gateway
 * Get health status for all payment gateways
 * Requires: VIEW_GATEWAYS permission
 */
router.get(
  '/',
  rbacMiddleware([Permission.VIEW_GATEWAYS]),
  async (req: Request, res: Response) => {
    try {
      const gatewayHealth = gatewayHealthService.getAllGatewayHealth();

      const result: Record<string, any> = {};
      for (const [provider, health] of gatewayHealth.entries()) {
        result[provider] = health;
      }

      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Failed to get gateway health', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/monitoring/gateway/:provider
 * Get health status for specific payment gateway
 * Requires: VIEW_GATEWAYS permission
 */
router.get(
  '/:provider',
  rbacMiddleware([Permission.VIEW_GATEWAYS]),
  async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;

      const health = gatewayHealthService.getGatewayHealth(provider as PaymentProvider);

      if (!health) {
        return res.status(404).json({
          success: false,
          error: 'Gateway not found or no health data'
        });
      }

      return res.json({
        success: true,
        data: health
      });
    } catch (error) {
      logger.error('Failed to get gateway health', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/monitoring/gateway/:provider/history
 * Get health history for specific gateway
 * Requires: VIEW_GATEWAYS permission
 */
router.get(
  '/:provider/history',
  rbacMiddleware([Permission.VIEW_GATEWAYS]),
  async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const last = parseInt(req.query.last as string) || 100;

      const history = gatewayHealthService.getGatewayHistory(
        provider as PaymentProvider,
        last
      );

      return res.json({
        success: true,
        data: history
      });
    } catch (error) {
      logger.error('Failed to get gateway history', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * POST /api/monitoring/gateway/:provider/check
 * Trigger immediate health check for gateway
 * Requires: MANAGE_GATEWAYS permission
 */
router.post(
  '/:provider/check',
  rbacMiddleware([Permission.MANAGE_GATEWAYS]),
  async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;

      const result = await gatewayHealthService.checkGateway(provider as PaymentProvider);

      logger.info('Manual gateway health check triggered', {
        provider,
        status: result.status
      });

      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Failed to check gateway', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * POST /api/monitoring/gateway/check-all
 * Trigger health check for all gateways
 * Requires: MANAGE_GATEWAYS permission
 */
router.post(
  '/check-all',
  rbacMiddleware([Permission.MANAGE_GATEWAYS]),
  async (req: Request, res: Response) => {
    try {
      await gatewayHealthService.checkAllGateways();

      logger.info('Manual health check triggered for all gateways');

      return res.json({
        success: true,
        message: 'Health check triggered for all gateways'
      });
    } catch (error) {
      logger.error('Failed to check all gateways', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;
