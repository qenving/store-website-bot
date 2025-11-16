import * as crypto from 'crypto';
import { PaymentProvider } from '../paymentTypes';

export class SignatureValidator {
  validateMidtrans(
    orderId: string,
    statusCode: string,
    grossAmount: string,
    serverKey: string,
    signature: string
  ): boolean {
    const string = orderId + statusCode + grossAmount + serverKey;
    const hash = crypto.createHash('sha512').update(string).digest('hex');
    return hash === signature;
  }

  validateTripay(
    merchantRef: string,
    amount: string,
    apiKey: string,
    signature: string
  ): boolean {
    const string = merchantRef + amount;
    const hash = crypto.createHmac('sha256', apiKey).update(string).digest('hex');
    return hash === signature;
  }

  validateDuitku(
    merchantCode: string,
    merchantOrderId: string,
    amount: string,
    apiKey: string,
    signature: string
  ): boolean {
    const string = merchantCode + merchantOrderId + amount + apiKey;
    const hash = crypto.createHash('md5').update(string).digest('hex');
    return hash === signature;
  }

  validateXendit(
    rawBody: string,
    callbackToken: string,
    signature: string
  ): boolean {
    const hash = crypto.createHmac('sha256', callbackToken).update(rawBody).digest('hex');
    return hash === signature;
  }

  validateCryptomus(
    rawBody: string,
    apiKey: string,
    signature: string
  ): boolean {
    const hash = crypto.createHmac('sha512', apiKey).update(rawBody).digest('hex');
    return hash === signature;
  }

  validate(
    provider: PaymentProvider,
    data: Record<string, any>,
    signature: string,
    config: Record<string, any>
  ): boolean {
    switch (provider) {
      case PaymentProvider.MIDTRANS:
        return this.validateMidtrans(
          data.order_id,
          data.status_code,
          data.gross_amount,
          config.serverKey,
          signature
        );

      case PaymentProvider.TRIPAY:
        return this.validateTripay(
          data.merchant_ref,
          data.amount,
          config.apiKey,
          signature
        );

      case PaymentProvider.DUITKU:
        return this.validateDuitku(
          config.merchantCode,
          data.merchantOrderId,
          data.amount,
          config.apiKey,
          signature
        );

      case PaymentProvider.XENDIT:
        return this.validateXendit(
          data.rawBody,
          config.callbackToken,
          signature
        );

      case PaymentProvider.CRYPTOMUS:
        return this.validateCryptomus(
          data.rawBody,
          config.apiKey,
          signature
        );

      default:
        return false;
    }
  }
}

export const signatureValidator = new SignatureValidator();
