import { PaymentProvider } from '../payments/paymentTypes';
import { paymentManager } from '../payments/paymentManager';
import { latencyService } from './latencyService';
import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'GatewayHealthService' });

export enum GatewayStatus {
  UP = 'up',
  DEGRADED = 'degraded',
  DOWN = 'down',
  UNKNOWN = 'unknown'
}

export interface GatewayHealthRecord {
  provider: PaymentProvider;
  status: GatewayStatus;
  latency: number;
  timestamp: Date;
  error?: string;
}

export interface GatewayHealthStats {
  provider: PaymentProvider;
  status: GatewayStatus;
  currentLatency: number;
  averageLatency: number;
  errors24h: number;
  uptime24h: number;
  lastCheck: Date;
  lastError?: string;
}

export class GatewayHealthService {
  private healthRecords: Map<PaymentProvider, GatewayHealthRecord[]> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private intervalMs = 5 * 60 * 1000; // 5 minutes
  private maxRecords = 288; // 24 hours at 5 min intervals

  async initialize(): Promise<void> {
    // Run initial check
    await this.checkAllGateways();

    // Start periodic checks
    this.checkInterval = setInterval(async () => {
      await this.checkAllGateways();
    }, this.intervalMs);

    logger.info('Gateway health service initialized', {
      interval: this.intervalMs
    });
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Gateway health service stopped');
    }
  }

  async checkAllGateways(): Promise<void> {
    const providers = [
      PaymentProvider.MIDTRANS,
      PaymentProvider.TRIPAY,
      PaymentProvider.DUITKU,
      PaymentProvider.XENDIT,
      PaymentProvider.CRYPTOMUS
    ];

    for (const provider of providers) {
      await this.checkGateway(provider);
    }
  }

  async checkGateway(provider: PaymentProvider): Promise<GatewayHealthRecord> {
    const start = Date.now();
    let status = GatewayStatus.UNKNOWN;
    let error: string | undefined;

    try {
      // Try to get status of a dummy/test payment
      // Most gateways return 404 or specific error for non-existent IDs
      const result = await paymentManager.getPaymentStatus(
        provider,
        `health_check_${Date.now()}`
      );

      const latency = Date.now() - start;

      // If we get a response (even error response), gateway is up
      if (latency < 1000) {
        status = GatewayStatus.UP;
      } else if (latency < 3000) {
        status = GatewayStatus.DEGRADED;
      } else {
        status = GatewayStatus.DOWN;
      }

      latencyService.record(`gateway_${provider}`, latency);

      const record: GatewayHealthRecord = {
        provider,
        status,
        latency,
        timestamp: new Date()
      };

      this.recordHealth(provider, record);

      logger.debug('Gateway health check completed', {
        provider,
        status,
        latency
      });

      return record;
    } catch (err) {
      const latency = Date.now() - start;
      error = err instanceof Error ? err.message : 'Unknown error';

      // Check if it's a network error or timeout
      if (error.includes('timeout') || error.includes('ECONNREFUSED')) {
        status = GatewayStatus.DOWN;
      } else {
        // Other errors might mean gateway is responding but our test ID is invalid
        // This is actually good - means gateway is up
        status = GatewayStatus.UP;
      }

      const record: GatewayHealthRecord = {
        provider,
        status,
        latency,
        timestamp: new Date(),
        error
      };

      this.recordHealth(provider, record);

      logger.debug('Gateway health check completed with error', {
        provider,
        status,
        latency,
        error
      });

      return record;
    }
  }

  private recordHealth(provider: PaymentProvider, record: GatewayHealthRecord): void {
    if (!this.healthRecords.has(provider)) {
      this.healthRecords.set(provider, []);
    }

    const records = this.healthRecords.get(provider)!;
    records.push(record);

    // Keep only last 24 hours
    if (records.length > this.maxRecords) {
      records.shift();
    }
  }

  getGatewayHealth(provider: PaymentProvider): GatewayHealthStats | null {
    const records = this.healthRecords.get(provider);
    if (!records || records.length === 0) {
      return null;
    }

    const latestRecord = records[records.length - 1];

    // Calculate errors in last 24 hours
    const now = Date.now();
    const last24h = records.filter(
      r => now - r.timestamp.getTime() < 24 * 60 * 60 * 1000
    );

    const errors24h = last24h.filter(
      r => r.status === GatewayStatus.DOWN || r.error
    ).length;

    const upRecords = last24h.filter(r => r.status === GatewayStatus.UP).length;
    const uptime24h = last24h.length > 0 ? (upRecords / last24h.length) * 100 : 0;

    const latencies = last24h.map(r => r.latency);
    const averageLatency =
      latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0;

    const lastError = [...last24h]
      .reverse()
      .find(r => r.error)?.error;

    return {
      provider,
      status: latestRecord.status,
      currentLatency: latestRecord.latency,
      averageLatency,
      errors24h,
      uptime24h: Math.round(uptime24h * 100) / 100,
      lastCheck: latestRecord.timestamp,
      lastError
    };
  }

  getAllGatewayHealth(): Map<PaymentProvider, GatewayHealthStats> {
    const result = new Map<PaymentProvider, GatewayHealthStats>();

    for (const provider of this.healthRecords.keys()) {
      const health = this.getGatewayHealth(provider);
      if (health) {
        result.set(provider, health);
      }
    }

    return result;
  }

  getGatewayHistory(
    provider: PaymentProvider,
    last: number = 100
  ): GatewayHealthRecord[] {
    const records = this.healthRecords.get(provider);
    if (!records) {
      return [];
    }

    return records.slice(-last);
  }
}

export const gatewayHealthService = new GatewayHealthService();
