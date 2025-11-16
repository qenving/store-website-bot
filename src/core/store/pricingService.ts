import { storeConfig } from './storeConfig';

const EXCHANGE_RATES: Record<string, number> = {
  'IDR_USD': 0.000065,
  'USD_IDR': 15400
};

export class PricingService {
  convertPrice(amount: number, fromCurrency: string, toCurrency: string): number {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    const rateKey = `${fromCurrency}_${toCurrency}`;
    const rate = EXCHANGE_RATES[rateKey];

    if (!rate) {
      return amount;
    }

    return Math.round(amount * rate * 100) / 100;
  }

  formatPrice(amount: number, currency: string): string {
    if (currency === 'IDR') {
      return `Rp ${amount.toLocaleString('id-ID')}`;
    } else if (currency === 'USD') {
      return `$${amount.toFixed(2)}`;
    }
    return `${amount} ${currency}`;
  }

  getDualPrice(amount: number, baseCurrency: string): {
    primary: { amount: number; currency: string; formatted: string };
    secondary: { amount: number; currency: string; formatted: string };
  } {
    const config = storeConfig.getConfig();
    const primaryCurrency = config.primaryCurrency;
    const secondaryCurrency = config.secondaryCurrency;

    const primaryAmount = baseCurrency === primaryCurrency
      ? amount
      : this.convertPrice(amount, baseCurrency, primaryCurrency);

    const secondaryAmount = baseCurrency === secondaryCurrency
      ? amount
      : this.convertPrice(amount, baseCurrency, secondaryCurrency);

    return {
      primary: {
        amount: primaryAmount,
        currency: primaryCurrency,
        formatted: this.formatPrice(primaryAmount, primaryCurrency)
      },
      secondary: {
        amount: secondaryAmount,
        currency: secondaryCurrency,
        formatted: this.formatPrice(secondaryAmount, secondaryCurrency)
      }
    };
  }

  getExchangeRate(fromCurrency: string, toCurrency: string): number {
    const rateKey = `${fromCurrency}_${toCurrency}`;
    return EXCHANGE_RATES[rateKey] || 1;
  }
}

export const pricingService = new PricingService();
