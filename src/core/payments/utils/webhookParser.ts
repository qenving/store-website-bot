import { PaymentProvider, UnifiedPaymentStatus } from '../paymentTypes';

export class WebhookParser {
  parseProvider(headers: Record<string, any>, body: any): PaymentProvider | null {
    if (headers['x-midtrans-signature']) {
      return PaymentProvider.MIDTRANS;
    }

    if (body.merchant_ref && body.reference) {
      return PaymentProvider.TRIPAY;
    }

    if (body.merchantCode && body.merchantOrderId) {
      return PaymentProvider.DUITKU;
    }

    if (headers['x-callback-token']) {
      return PaymentProvider.XENDIT;
    }

    if (body.sign && body.order_id) {
      return PaymentProvider.CRYPTOMUS;
    }

    return null;
  }

  extractSignature(provider: PaymentProvider, headers: Record<string, any>, body: any): string | null {
    switch (provider) {
      case PaymentProvider.MIDTRANS:
        return headers['x-midtrans-signature'] || body.signature_key;

      case PaymentProvider.TRIPAY:
        return headers['x-callback-signature'] || body.signature;

      case PaymentProvider.DUITKU:
        return body.signature;

      case PaymentProvider.XENDIT:
        return headers['x-callback-token'];

      case PaymentProvider.CRYPTOMUS:
        return body.sign;

      default:
        return null;
    }
  }

  extractOrderId(provider: PaymentProvider, body: any): string | null {
    switch (provider) {
      case PaymentProvider.MIDTRANS:
        return body.order_id;

      case PaymentProvider.TRIPAY:
        return body.merchant_ref;

      case PaymentProvider.DUITKU:
        return body.merchantOrderId;

      case PaymentProvider.XENDIT:
        return body.external_id;

      case PaymentProvider.CRYPTOMUS:
        return body.order_id;

      default:
        return null;
    }
  }

  mapStatus(provider: PaymentProvider, providerStatus: string): UnifiedPaymentStatus {
    switch (provider) {
      case PaymentProvider.MIDTRANS:
        return this.mapMidtransStatus(providerStatus);

      case PaymentProvider.TRIPAY:
        return this.mapTripayStatus(providerStatus);

      case PaymentProvider.DUITKU:
        return this.mapDuitkuStatus(providerStatus);

      case PaymentProvider.XENDIT:
        return this.mapXenditStatus(providerStatus);

      case PaymentProvider.CRYPTOMUS:
        return this.mapCryptomusStatus(providerStatus);

      default:
        return UnifiedPaymentStatus.PENDING;
    }
  }

  private mapMidtransStatus(status: string): UnifiedPaymentStatus {
    const statusMap: Record<string, UnifiedPaymentStatus> = {
      'capture': UnifiedPaymentStatus.PAID,
      'settlement': UnifiedPaymentStatus.PAID,
      'pending': UnifiedPaymentStatus.PENDING,
      'deny': UnifiedPaymentStatus.FAILED,
      'expire': UnifiedPaymentStatus.EXPIRED,
      'cancel': UnifiedPaymentStatus.CANCELLED,
      'refund': UnifiedPaymentStatus.REFUNDED
    };
    return statusMap[status] || UnifiedPaymentStatus.PENDING;
  }

  private mapTripayStatus(status: string): UnifiedPaymentStatus {
    const statusMap: Record<string, UnifiedPaymentStatus> = {
      'PAID': UnifiedPaymentStatus.PAID,
      'UNPAID': UnifiedPaymentStatus.PENDING,
      'EXPIRED': UnifiedPaymentStatus.EXPIRED,
      'FAILED': UnifiedPaymentStatus.FAILED,
      'REFUND': UnifiedPaymentStatus.REFUNDED
    };
    return statusMap[status] || UnifiedPaymentStatus.PENDING;
  }

  private mapDuitkuStatus(status: string): UnifiedPaymentStatus {
    const statusMap: Record<string, UnifiedPaymentStatus> = {
      'SUCCESS': UnifiedPaymentStatus.PAID,
      'PENDING': UnifiedPaymentStatus.PENDING,
      'EXPIRED': UnifiedPaymentStatus.EXPIRED,
      'FAILED': UnifiedPaymentStatus.FAILED,
      'CANCELLED': UnifiedPaymentStatus.CANCELLED
    };
    return statusMap[status] || UnifiedPaymentStatus.PENDING;
  }

  private mapXenditStatus(status: string): UnifiedPaymentStatus {
    const statusMap: Record<string, UnifiedPaymentStatus> = {
      'PAID': UnifiedPaymentStatus.PAID,
      'PENDING': UnifiedPaymentStatus.PENDING,
      'EXPIRED': UnifiedPaymentStatus.EXPIRED,
      'FAILED': UnifiedPaymentStatus.FAILED
    };
    return statusMap[status] || UnifiedPaymentStatus.PENDING;
  }

  private mapCryptomusStatus(status: string): UnifiedPaymentStatus {
    const statusMap: Record<string, UnifiedPaymentStatus> = {
      'paid': UnifiedPaymentStatus.PAID,
      'pending': UnifiedPaymentStatus.PENDING,
      'expired': UnifiedPaymentStatus.EXPIRED,
      'failed': UnifiedPaymentStatus.FAILED,
      'cancelled': UnifiedPaymentStatus.CANCELLED
    };
    return statusMap[status] || UnifiedPaymentStatus.PENDING;
  }
}

export const webhookParser = new WebhookParser();
