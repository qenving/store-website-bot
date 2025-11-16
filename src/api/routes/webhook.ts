import { Router, Request, Response } from 'express';
import { transactionEngine } from '../../core/transactions/TransactionEngine';
import { WebhookPayload } from '../../core/transactions/TransactionTypes';
import { formatError, isAppError } from '../../core/utils/errors';
import { createLogger } from '../../core/logging/logger';

const router = Router();
const logger = createLogger({ module: 'WebhookAPI' });

router.post('/mock-webhook', async (req: Request, res: Response) => {
  try {
    const payload: WebhookPayload = req.body;

    logger.info('Received webhook', { orderId: payload.orderId, status: payload.status });

    if (!payload.orderId || !payload.status) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'orderId and status are required'
        }
      });
    }

    await transactionEngine.handleWebhook(payload);

    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    logger.error('Failed to process webhook', error);
    const formattedError = formatError(error);

    res.status(isAppError(error) ? error.statusCode : 500).json({
      success: false,
      error: formattedError
    });
  }
});

export default router;
