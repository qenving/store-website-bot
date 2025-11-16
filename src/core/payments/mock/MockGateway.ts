import { v4 as uuidv4 } from 'uuid';
import { PaymentResult, WebhookPayload } from '../../transactions/TransactionTypes';
import { PaymentError } from '../../utils/errors';
import { createLogger } from '../../logging/logger';
import { getConfig } from '../../config/config';

const logger = createLogger({ module: 'MockGateway' });

export interface CreatePaymentInput {
  orderId: string;
  amount: number;
  currency: string;
  userId: string;
  productId: string;
  metadata?: Record<string, any>;
}

export interface MockPayment {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  paymentLink: string;
  createdAt: Date;
  status: 'pending' | 'paid' | 'expired';
}

class MockPaymentGateway {
  private payments: Map<string, MockPayment> = new Map();
  private autoConfirmTimers: Map<string, NodeJS.Timeout> = new Map();

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const paymentId = uuidv4();
    const config = getConfig();

    const paymentLink = `https://mock-payment.gateway/pay/${paymentId}`;

    const payment: MockPayment = {
      paymentId,
      orderId: input.orderId,
      amount: input.amount,
      currency: input.currency,
      paymentLink,
      createdAt: new Date(),
      status: 'pending'
    };

    this.payments.set(paymentId, payment);

    logger.info('Mock payment created', {
      paymentId,
      orderId: input.orderId,
      amount: input.amount,
      currency: input.currency
    });

    if (config.paymentGateway.mock.enabled && config.paymentGateway.mock.autoConfirmDelay > 0) {
      this.scheduleAutoConfirm(paymentId, input.orderId, config.paymentGateway.mock.autoConfirmDelay);
    }

    return {
      success: true,
      paymentLink,
      transactionId: paymentId,
      orderId: input.orderId
    };
  }

  private scheduleAutoConfirm(paymentId: string, orderId: string, delay: number): void {
    const timer = setTimeout(() => {
      const payment = this.payments.get(paymentId);

      if (payment && payment.status === 'pending') {
        payment.status = 'paid';

        logger.info('Mock payment auto-confirmed', {
          paymentId,
          orderId
        });

        this.triggerWebhook(orderId, 'completed');
      }

      this.autoConfirmTimers.delete(paymentId);
    }, delay);

    this.autoConfirmTimers.set(paymentId, timer);
  }

  async manualConfirm(orderId: string): Promise<boolean> {
    const payment = Array.from(this.payments.values()).find(p => p.orderId === orderId);

    if (!payment) {
      throw new PaymentError(`Payment not found for order: ${orderId}`);
    }

    if (payment.status === 'paid') {
      logger.warn('Payment already confirmed', { orderId });
      return false;
    }

    payment.status = 'paid';

    const timer = this.autoConfirmTimers.get(payment.paymentId);
    if (timer) {
      clearTimeout(timer);
      this.autoConfirmTimers.delete(payment.paymentId);
    }

    logger.info('Mock payment manually confirmed', {
      paymentId: payment.paymentId,
      orderId
    });

    this.triggerWebhook(orderId, 'completed');

    return true;
  }

  async cancelPayment(orderId: string): Promise<boolean> {
    const payment = Array.from(this.payments.values()).find(p => p.orderId === orderId);

    if (!payment) {
      throw new PaymentError(`Payment not found for order: ${orderId}`);
    }

    if (payment.status === 'paid') {
      throw new PaymentError('Cannot cancel a paid payment');
    }

    payment.status = 'expired';

    const timer = this.autoConfirmTimers.get(payment.paymentId);
    if (timer) {
      clearTimeout(timer);
      this.autoConfirmTimers.delete(payment.paymentId);
    }

    logger.info('Mock payment cancelled', {
      paymentId: payment.paymentId,
      orderId
    });

    this.triggerWebhook(orderId, 'cancelled');

    return true;
  }

  getPayment(orderId: string): MockPayment | null {
    const payment = Array.from(this.payments.values()).find(p => p.orderId === orderId);
    return payment || null;
  }

  getAllPayments(): MockPayment[] {
    return Array.from(this.payments.values());
  }

  verifyWebhook(payload: WebhookPayload): boolean {
    logger.info('Mock webhook verification', { orderId: payload.orderId });
    return true;
  }

  private triggerWebhook(orderId: string, status: 'completed' | 'cancelled'): void {
    logger.info('Mock webhook triggered', { orderId, status });
  }

  cleanup(): void {
    for (const timer of this.autoConfirmTimers.values()) {
      clearTimeout(timer);
    }
    this.autoConfirmTimers.clear();
    logger.info('Mock gateway cleanup completed');
  }
}

export const mockGateway = new MockPaymentGateway();
