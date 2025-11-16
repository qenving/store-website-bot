import {
  OrderData,
  CreatePaymentResult,
  PaymentStatusResult,
  VerifiedWebhookData,
  UnifiedPaymentStatus,
  PaymentProvider,
  GatewayConfig
} from '../paymentTypes';

export abstract class BasePaymentAdapter {
  protected config: GatewayConfig;

  constructor(config: GatewayConfig) {
    this.config = config;
  }

  abstract createPayment(order: OrderData): Promise<CreatePaymentResult>;

  abstract getPaymentStatus(paymentId: string): Promise<PaymentStatusResult>;

  abstract verifyWebhook(
    headers: Record<string, any>,
    body: any,
    rawBody?: string
  ): Promise<VerifiedWebhookData>;

  abstract cancelPayment(paymentId: string): Promise<boolean>;

  abstract mapStatus(providerStatus: string): UnifiedPaymentStatus;

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getProvider(): PaymentProvider {
    return this.config.provider;
  }

  getPriority(): number {
    return this.config.priority;
  }

  isTestMode(): boolean {
    return this.config.testMode;
  }
}
