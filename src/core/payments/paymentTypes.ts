export enum PaymentProvider {
  MIDTRANS = 'midtrans',
  TRIPAY = 'tripay',
  DUITKU = 'duitku',
  XENDIT = 'xendit',
  CRYPTOMUS = 'cryptomus',
  MOCK = 'mock'
}

export enum UnifiedPaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PAID = 'paid',
  FAILED = 'failed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded'
}

export interface OrderData {
  orderId: string;
  amount: number;
  currency: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  items?: Array<{
    name: string;
    price: number;
    quantity: number;
  }>;
  returnUrl?: string;
  callbackUrl?: string;
  metadata?: Record<string, any>;
}

export interface CreatePaymentResult {
  success: boolean;
  provider: PaymentProvider;
  paymentId: string;
  paymentUrl: string;
  amount: number;
  currency: string;
  expiresAt?: Date;
  qrCode?: string;
  vaNumber?: string;
  providerData?: Record<string, any>;
  error?: string;
}

export interface PaymentStatusResult {
  success: boolean;
  paymentId: string;
  status: UnifiedPaymentStatus;
  paidAt?: Date;
  amount?: number;
  currency?: string;
  providerStatus?: string;
  providerData?: Record<string, any>;
}

export interface VerifiedWebhookData {
  valid: boolean;
  paymentId: string;
  orderId: string;
  status: UnifiedPaymentStatus;
  amount: number;
  currency: string;
  paidAt?: Date;
  metadata?: Record<string, any>;
  rawData?: Record<string, any>;
}

export interface GatewayConfig {
  provider: PaymentProvider;
  enabled: boolean;
  priority: number;
  testMode: boolean;
  config: {
    apiKey?: string;
    serverKey?: string;
    merchantCode?: string;
    merchantId?: string;
    privateKey?: string;
    callbackToken?: string;
    [key: string]: any;
  };
}

export interface GatewayHealth {
  provider: PaymentProvider;
  healthy: boolean;
  lastCheck: Date;
  responseTime?: number;
  error?: string;
}

export interface WebhookLog {
  id: string;
  provider: PaymentProvider;
  orderId: string;
  payload: Record<string, any>;
  signature?: string;
  verified: boolean;
  processed: boolean;
  processedAt?: Date;
  error?: string;
  createdAt: Date;
}
