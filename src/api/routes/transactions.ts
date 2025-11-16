import { Router, Request, Response } from 'express';
import { transactionEngine } from '../../core/transactions/TransactionEngine';
import { formatError, isAppError } from '../../core/utils/errors';
import { createLogger } from '../../core/logging/logger';

const router = Router();
const logger = createLogger({ module: 'TransactionsAPI' });

router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    const transactions = await transactionEngine.getAllTransactions(limit);

    res.json({
      success: true,
      data: transactions,
      count: transactions.length
    });
  } catch (error) {
    logger.error('Failed to get transactions', error);
    const formattedError = formatError(error);

    res.status(isAppError(error) ? error.statusCode : 500).json({
      success: false,
      error: formattedError
    });
  }
});

router.get('/:transactionId', async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;

    const transaction = await transactionEngine.getTransaction(transactionId);

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    logger.error('Failed to get transaction', error);
    const formattedError = formatError(error);

    res.status(isAppError(error) ? error.statusCode : 500).json({
      success: false,
      error: formattedError
    });
  }
});

router.get('/order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const transaction = await transactionEngine.getStatus(orderId);

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    logger.error('Failed to get transaction by order id', error);
    const formattedError = formatError(error);

    res.status(isAppError(error) ? error.statusCode : 500).json({
      success: false,
      error: formattedError
    });
  }
});

router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const transactions = await transactionEngine.getUserTransactions(userId);

    res.json({
      success: true,
      data: transactions,
      count: transactions.length
    });
  } catch (error) {
    logger.error('Failed to get user transactions', error);
    const formattedError = formatError(error);

    res.status(isAppError(error) ? error.statusCode : 500).json({
      success: false,
      error: formattedError
    });
  }
});

router.post('/:orderId/cancel', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const transaction = await transactionEngine.cancelTransaction(orderId);

    res.json({
      success: true,
      data: transaction,
      message: 'Transaction cancelled successfully'
    });
  } catch (error) {
    logger.error('Failed to cancel transaction', error);
    const formattedError = formatError(error);

    res.status(isAppError(error) ? error.statusCode : 500).json({
      success: false,
      error: formattedError
    });
  }
});

export default router;
