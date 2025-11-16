import { v4 as uuidv4 } from 'uuid';
import {
  Transaction,
  TransactionStatus,
  CreateTransactionInput,
  UpdateTransactionInput,
  PaymentResult,
  WebhookPayload,
  TransactionEvent
} from './TransactionTypes';
import { dal } from '../db/dal';
import { mockGateway } from '../payments/mock/MockGateway';
import { getConfig, configManager } from '../config/config';
import { TransactionError, NotFoundError, ValidationError } from '../utils/errors';
import { createLogger } from '../logging/logger';
import {
  validateSchema,
  createTransactionSchema,
  updateTransactionSchema,
  validateId,
  validateStatus
} from '../utils/validate';

const logger = createLogger({ module: 'TransactionEngine' });

type EventCallback = (event: TransactionEvent) => void;

class TransactionEngineCore {
  private eventCallbacks: EventCallback[] = [];

  onEvent(callback: EventCallback): void {
    this.eventCallbacks.push(callback);
  }

  private emitEvent(event: TransactionEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        logger.error('Error in event callback', error);
      }
    }
  }

  async createOrder(input: CreateTransactionInput): Promise<PaymentResult> {
    logger.info('Creating order', { userId: input.userId, productId: input.productId });

    const validatedInput = validateSchema<CreateTransactionInput>(createTransactionSchema, input);

    const user = await dal.users.findById(validatedInput.userId);
    if (!user) {
      throw new NotFoundError('User', validatedInput.userId);
    }

    const product = configManager.getProduct(validatedInput.productId);
    if (!product) {
      throw new NotFoundError('Product', validatedInput.productId);
    }

    if (validatedInput.amount !== product.price) {
      throw new ValidationError(
        `Amount mismatch: expected ${product.price}, got ${validatedInput.amount}`
      );
    }

    const orderId = `ORD-${Date.now()}-${uuidv4().substring(0, 8)}`;

    const transaction = await dal.transactions.create({
      orderId,
      userId: validatedInput.userId,
      productId: validatedInput.productId,
      amount: validatedInput.amount,
      currency: validatedInput.currency || 'IDR',
      status: 'pending',
      metadata: {
        ...validatedInput.metadata,
        productName: product.name,
        productType: product.type
      }
    });

    logger.info('Transaction created', {
      transactionId: transaction.id,
      orderId: transaction.orderId
    });

    this.emitEvent({
      type: 'transaction_created',
      transaction,
      timestamp: new Date()
    });

    try {
      const paymentResult = await mockGateway.createPayment({
        orderId: transaction.orderId,
        amount: transaction.amount,
        currency: transaction.currency,
        userId: transaction.userId,
        productId: transaction.productId,
        metadata: transaction.metadata
      });

      await dal.transactions.updateState(transaction.id, {
        status: 'processing',
        paymentLink: paymentResult.paymentLink,
        paymentMethod: 'mock_gateway'
      });

      logger.info('Payment created', {
        transactionId: transaction.id,
        orderId: transaction.orderId,
        paymentLink: paymentResult.paymentLink
      });

      const updatedTransaction = await dal.transactions.findById(transaction.id);
      if (updatedTransaction) {
        this.emitEvent({
          type: 'transaction_updated',
          transaction: updatedTransaction,
          timestamp: new Date()
        });
      }

      return {
        ...paymentResult,
        transactionId: transaction.id
      };
    } catch (error) {
      await dal.transactions.updateState(transaction.id, {
        status: 'failed',
        metadata: {
          ...transaction.metadata,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });

      logger.error('Failed to create payment', error, {
        transactionId: transaction.id,
        orderId: transaction.orderId
      });

      const failedTransaction = await dal.transactions.findById(transaction.id);
      if (failedTransaction) {
        this.emitEvent({
          type: 'transaction_failed',
          transaction: failedTransaction,
          timestamp: new Date()
        });
      }

      throw new TransactionError('Failed to create payment', error);
    }
  }

  async updateState(orderId: string, update: UpdateTransactionInput): Promise<Transaction> {
    logger.info('Updating transaction state', { orderId, status: update.status });

    validateId(orderId, 'orderId');
    const validatedUpdate = validateSchema<UpdateTransactionInput>(updateTransactionSchema, update);

    const transaction = await dal.transactions.findByOrderId(orderId);
    if (!transaction) {
      throw new NotFoundError('Transaction with orderId', orderId);
    }

    if (validatedUpdate.status) {
      validateStatus(validatedUpdate.status);
    }

    const updateData: Partial<Transaction> = { ...validatedUpdate };

    if (validatedUpdate.status === 'completed' && !validatedUpdate.completedAt) {
      updateData.completedAt = new Date();
    }

    const updatedTransaction = await dal.transactions.updateState(transaction.id, updateData);

    logger.info('Transaction state updated', {
      transactionId: updatedTransaction.id,
      orderId: updatedTransaction.orderId,
      status: updatedTransaction.status
    });

    if (updatedTransaction.status === 'completed') {
      this.emitEvent({
        type: 'transaction_completed',
        transaction: updatedTransaction,
        timestamp: new Date()
      });

      await this.processCompletedTransaction(updatedTransaction);
    } else if (updatedTransaction.status === 'failed') {
      this.emitEvent({
        type: 'transaction_failed',
        transaction: updatedTransaction,
        timestamp: new Date()
      });
    } else {
      this.emitEvent({
        type: 'transaction_updated',
        transaction: updatedTransaction,
        timestamp: new Date()
      });
    }

    return updatedTransaction;
  }

  private async processCompletedTransaction(transaction: Transaction): Promise<void> {
    logger.info('Processing completed transaction', {
      transactionId: transaction.id,
      orderId: transaction.orderId,
      productId: transaction.productId
    });

    const product = configManager.getProduct(transaction.productId);
    if (!product) {
      logger.warn('Product not found for completed transaction', {
        transactionId: transaction.id,
        productId: transaction.productId
      });
      return;
    }

    logger.info('Transaction processed successfully', {
      transactionId: transaction.id,
      productType: product.type,
      productName: product.name
    });
  }

  async getStatus(orderId: string): Promise<Transaction> {
    validateId(orderId, 'orderId');

    logger.debug('Getting transaction status', { orderId });

    const transaction = await dal.transactions.findByOrderId(orderId);
    if (!transaction) {
      throw new NotFoundError('Transaction with orderId', orderId);
    }

    return transaction;
  }

  async getTransaction(transactionId: string): Promise<Transaction> {
    validateId(transactionId, 'transactionId');

    logger.debug('Getting transaction', { transactionId });

    const transaction = await dal.transactions.findById(transactionId);
    if (!transaction) {
      throw new NotFoundError('Transaction', transactionId);
    }

    return transaction;
  }

  async getUserTransactions(userId: string): Promise<Transaction[]> {
    validateId(userId, 'userId');

    logger.debug('Getting user transactions', { userId });

    return dal.transactions.findByUserId(userId);
  }

  async getAllTransactions(limit?: number): Promise<Transaction[]> {
    logger.debug('Getting all transactions', { limit });

    return dal.transactions.findAll(limit);
  }

  async handleWebhook(payload: WebhookPayload): Promise<void> {
    logger.info('Handling webhook', { orderId: payload.orderId, status: payload.status });

    const isValid = mockGateway.verifyWebhook(payload);
    if (!isValid) {
      throw new TransactionError('Invalid webhook signature');
    }

    const updateData: UpdateTransactionInput = {
      status: payload.status,
      paymentMethod: payload.paymentMethod
    };

    if (payload.metadata) {
      updateData.metadata = payload.metadata;
    }

    await this.updateState(payload.orderId, updateData);

    logger.info('Webhook processed successfully', { orderId: payload.orderId });
  }

  async cancelTransaction(orderId: string): Promise<Transaction> {
    validateId(orderId, 'orderId');

    logger.info('Cancelling transaction', { orderId });

    const transaction = await dal.transactions.findByOrderId(orderId);
    if (!transaction) {
      throw new NotFoundError('Transaction with orderId', orderId);
    }

    if (transaction.status === 'completed') {
      throw new TransactionError('Cannot cancel a completed transaction');
    }

    if (transaction.status === 'cancelled') {
      logger.warn('Transaction already cancelled', { orderId });
      return transaction;
    }

    await mockGateway.cancelPayment(orderId);

    const updatedTransaction = await this.updateState(orderId, {
      status: 'cancelled'
    });

    logger.info('Transaction cancelled', { orderId });

    return updatedTransaction;
  }
}

export const transactionEngine = new TransactionEngineCore();
