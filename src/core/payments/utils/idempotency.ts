import { dal } from '../../db/dal';
import { createLogger } from '../../logging/logger';

const logger = createLogger({ module: 'Idempotency' });

export class IdempotencyManager {
  private processedWebhooks: Set<string> = new Set();

  private getWebhookKey(provider: string, orderId: string, signature: string): string {
    return `webhook_${provider}_${orderId}_${signature}`;
  }

  async isWebhookProcessed(
    provider: string,
    orderId: string,
    signature: string
  ): Promise<boolean> {
    const key = this.getWebhookKey(provider, orderId, signature);

    if (this.processedWebhooks.has(key)) {
      logger.info('Webhook already processed (memory cache)', { provider, orderId });
      return true;
    }

    const stored = await dal.settings.get(key);
    if (stored) {
      logger.info('Webhook already processed (database)', { provider, orderId });
      this.processedWebhooks.add(key);
      return true;
    }

    return false;
  }

  async markWebhookProcessed(
    provider: string,
    orderId: string,
    signature: string
  ): Promise<void> {
    const key = this.getWebhookKey(provider, orderId, signature);

    this.processedWebhooks.add(key);

    await dal.settings.set(key, {
      provider,
      orderId,
      signature,
      processedAt: new Date().toISOString()
    });

    logger.info('Webhook marked as processed', { provider, orderId });
  }

  clearMemoryCache(): void {
    this.processedWebhooks.clear();
    logger.info('Idempotency memory cache cleared');
  }
}

export const idempotencyManager = new IdempotencyManager();
