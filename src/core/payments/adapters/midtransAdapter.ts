import { BasePaymentAdapter } from './baseAdapter';
import {
  OrderData,
  CreatePaymentResult,
  PaymentStatusResult,
  VerifiedWebhookData,
  UnifiedPaymentStatus,
  PaymentProvider
} from '../paymentTypes';
import { httpClient } from '../utils/httpClient';
import { signatureValidator } from '../utils/signatureValidator';
import { createLogger } from '../../logging/logger';

const logger = createLogger({ module: 'MidtransAdapter' });

export class MidtransAdapter extends BasePaymentAdapter {
  private getBaseUrl(): string {
    return this.config.testMode
      ? 'https://app.sandbox.midtrans.com/snap/v1'
      : 'https://app.midtrans.com/snap/v1';
  }

  async createPayment(order: OrderData): Promise<CreatePaymentResult> {
    try {
      const serverKey = this.config.config.serverKey;
      const auth = Buffer.from(serverKey + ':').toString('base64');

      const payload = {
        transaction_details: {
          order_id: order.orderId,
          gross_amount: order.amount
        },
        customer_details: {
          first_name: order.customerName,
          email: order.customerEmail,
          phone: order.customerPhone
        },
        item_details: order.items?.map(item => ({
          id: item.name,
          price: item.price,
          quantity: item.quantity,
          name: item.name
        })),
        callbacks: {
          finish: order.returnUrl
        }
      };

      const response = await httpClient.post<{ token: string; redirect_url: string }>(
        `${this.getBaseUrl()}/transactions`,
        payload,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Midtrans payment created', { orderId: order.orderId });

      return {
        success: true,
        provider: PaymentProvider.MIDTRANS,
        paymentId: order.orderId,
        paymentUrl: response.redirect_url,
        amount: order.amount,
        currency: order.currency,
        providerData: response
      };
    } catch (error) {
      logger.error('Midtrans payment creation failed', error);

      return {
        success: false,
        provider: PaymentProvider.MIDTRANS,
        paymentId: order.orderId,
        paymentUrl: '',
        amount: order.amount,
        currency: order.currency,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatusResult> {
    try {
      const serverKey = this.config.config.serverKey;
      const auth = Buffer.from(serverKey + ':').toString('base64');

      const response = await httpClient.get<any>(
        `${this.getBaseUrl()}/transactions/${paymentId}/status`,
        {
          headers: {
            'Authorization': `Basic ${auth}`
          }
        }
      );

      const status = this.mapStatus(response.transaction_status);

      return {
        success: true,
        paymentId,
        status,
        amount: parseFloat(response.gross_amount),
        currency: 'IDR',
        providerStatus: response.transaction_status,
        providerData: response
      };
    } catch (error) {
      logger.error('Midtrans status check failed', error);

      return {
        success: false,
        paymentId,
        status: UnifiedPaymentStatus.PENDING
      };
    }
  }

  async verifyWebhook(
    headers: Record<string, any>,
    body: any
  ): Promise<VerifiedWebhookData> {
    const signature = headers['x-midtrans-signature'] || body.signature_key;
    const serverKey = this.config.config.serverKey;

    const valid = signatureValidator.validateMidtrans(
      body.order_id,
      body.status_code,
      body.gross_amount,
      serverKey,
      signature
    );

    if (!valid) {
      logger.warn('Midtrans webhook signature invalid', { orderId: body.order_id });
      return {
        valid: false,
        paymentId: body.order_id,
        orderId: body.order_id,
        status: UnifiedPaymentStatus.PENDING,
        amount: 0,
        currency: 'IDR'
      };
    }

    const status = this.mapStatus(body.transaction_status);

    return {
      valid: true,
      paymentId: body.order_id,
      orderId: body.order_id,
      status,
      amount: parseFloat(body.gross_amount),
      currency: 'IDR',
      paidAt: status === UnifiedPaymentStatus.PAID ? new Date() : undefined,
      rawData: body
    };
  }

  async cancelPayment(paymentId: string): Promise<boolean> {
    try {
      const serverKey = this.config.config.serverKey;
      const auth = Buffer.from(serverKey + ':').toString('base64');

      await httpClient.post(
        `${this.getBaseUrl()}/transactions/${paymentId}/cancel`,
        {},
        {
          headers: {
            'Authorization': `Basic ${auth}`
          }
        }
      );

      logger.info('Midtrans payment cancelled', { paymentId });
      return true;
    } catch (error) {
      logger.error('Midtrans cancel failed', error);
      return false;
    }
  }

  mapStatus(providerStatus: string): UnifiedPaymentStatus {
    const statusMap: Record<string, UnifiedPaymentStatus> = {
      'capture': UnifiedPaymentStatus.PAID,
      'settlement': UnifiedPaymentStatus.PAID,
      'pending': UnifiedPaymentStatus.PENDING,
      'deny': UnifiedPaymentStatus.FAILED,
      'expire': UnifiedPaymentStatus.EXPIRED,
      'cancel': UnifiedPaymentStatus.CANCELLED,
      'refund': UnifiedPaymentStatus.REFUNDED
    };

    return statusMap[providerStatus] || UnifiedPaymentStatus.PENDING;
  }
}
