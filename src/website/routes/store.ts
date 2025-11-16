import { Router, Request, Response } from 'express';
import { transactionEngine } from '../../core/transactions/TransactionEngine';
import { dal } from '../../core/db/dal';
import { configManager } from '../../core/config/config';
import { createLogger } from '../../core/logging/logger';
import { formatError } from '../../core/utils/errors';

const router = Router();
const logger = createLogger({ module: 'StoreRoutes' });

router.get('/products', async (req: Request, res: Response) => {
  try {
    const products = configManager.getAllProducts();

    res.render('products', {
      title: 'Products',
      products
    });
  } catch (error) {
    logger.error('Failed to get products', error);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/order', async (req: Request, res: Response) => {
  try {
    const productId = req.query.productId as string;

    if (!productId) {
      return res.redirect('/store/products');
    }

    const product = configManager.getProduct(productId);

    if (!product) {
      return res.redirect('/store/products');
    }

    res.render('order', {
      title: 'Order',
      product
    });
  } catch (error) {
    logger.error('Failed to load order page', error);
    res.status(500).send('Internal Server Error');
  }
});

router.post('/order', async (req: Request, res: Response) => {
  try {
    const { productId, userId, username } = req.body;

    if (!productId || !userId || !username) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const product = configManager.getProduct(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    const user = await dal.users.getOrCreate(userId, username);

    const result = await transactionEngine.createOrder({
      userId: user.id,
      productId: product.id,
      amount: product.price,
      currency: product.currency,
      metadata: {
        source: 'website',
        webUserId: userId,
        webUsername: username
      }
    });

    logger.info('Order created via website', {
      userId: user.id,
      orderId: result.orderId,
      productId
    });

    res.json({
      success: true,
      data: {
        orderId: result.orderId,
        transactionId: result.transactionId,
        paymentLink: result.paymentLink
      }
    });
  } catch (error) {
    logger.error('Failed to create order', error);
    const formattedError = formatError(error);

    res.status(500).json({
      success: false,
      error: formattedError.message
    });
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    const orderId = req.query.orderId as string;

    if (!orderId) {
      return res.render('status', {
        title: 'Order Status',
        transaction: null
      });
    }

    const transaction = await transactionEngine.getStatus(orderId);

    res.render('status', {
      title: 'Order Status',
      transaction
    });
  } catch (error) {
    logger.error('Failed to get order status', error);

    res.render('status', {
      title: 'Order Status',
      transaction: null,
      error: 'Order not found'
    });
  }
});

export default router;
