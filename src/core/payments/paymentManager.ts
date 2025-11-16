import { PaymentProvider, PaymentStatusResult } from './paymentTypes';
import { MidtransAdapter } from './adapters/midtransAdapter';
import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'PaymentManager' });

export class PaymentManager {
  private adapters: Map<PaymentProvider, any> = new Map();

  constructor() {
    // Initialize adapters (for now just Midtrans, others can be added)
    this.initializeAdapters();
  }

  private initializeAdapters(): void {
    // For now, only initialize Midtrans
    // Other adapters (Tripay, Duitku, Xendit, Cryptomus) will be added when implemented
    try {
      const midtransConfig = {
        provider: PaymentProvider.MIDTRANS,
        config: {
          serverKey: process.env.MIDTRANS_SERVER_KEY || 'test_key',
          clientKey: process.env.MIDTRANS_CLIENT_KEY || 'test_key'
        },
        testMode: process.env.NODE_ENV !== 'production'
      };

      this.adapters.set(PaymentProvider.MIDTRANS, new MidtransAdapter(midtransConfig));

      logger.info('Payment adapters initialized');
    } catch (error) {
      logger.error('Failed to initialize payment adapters', error);
    }
  }

  async getPaymentStatus(
    provider: PaymentProvider,
    paymentId: string
  ): Promise<PaymentStatusResult> {
    const adapter = this.adapters.get(provider);

    if (!adapter) {
      logger.warn('No adapter found for provider', { provider });
      return {
        success: false,
        paymentId,
        status: 'pending' as any
      };
    }

    try {
      const result = await adapter.getPaymentStatus(paymentId);
      return result;
    } catch (error) {
      logger.error('Failed to get payment status', {
        provider,
        paymentId,
        error
      });

      return {
        success: false,
        paymentId,
        status: 'pending' as any
      };
    }
  }

  getAdapter(provider: PaymentProvider): any {
    return this.adapters.get(provider);
  }

  isProviderAvailable(provider: PaymentProvider): boolean {
    return this.adapters.has(provider);
  }
}

export const paymentManager = new PaymentManager();
