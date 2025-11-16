import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'LatencyService' });

export interface LatencyRecord {
  timestamp: Date;
  latency: number;
}

export interface LatencyStats {
  service: string;
  current: number;
  average: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

export class LatencyService {
  private latencies: Map<string, LatencyRecord[]> = new Map();
  private maxRecords = 1000;

  record(service: string, latency: number): void {
    if (!this.latencies.has(service)) {
      this.latencies.set(service, []);
    }

    const records = this.latencies.get(service)!;
    records.push({
      timestamp: new Date(),
      latency
    });

    // Keep only last maxRecords
    if (records.length > this.maxRecords) {
      records.shift();
    }
  }

  async measureLatency<T>(service: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const latency = Date.now() - start;
      this.record(service, latency);
      return result;
    } catch (error) {
      const latency = Date.now() - start;
      this.record(service, latency);
      throw error;
    }
  }

  measureLatencySync<T>(service: string, fn: () => T): T {
    const start = Date.now();
    try {
      const result = fn();
      const latency = Date.now() - start;
      this.record(service, latency);
      return result;
    } catch (error) {
      const latency = Date.now() - start;
      this.record(service, latency);
      throw error;
    }
  }

  getLatencyStats(service: string, last?: number): LatencyStats | null {
    const records = this.latencies.get(service);
    if (!records || records.length === 0) {
      return null;
    }

    const subset = last ? records.slice(-last) : records;
    const latencies = subset.map(r => r.latency).sort((a, b) => a - b);

    const sum = latencies.reduce((a, b) => a + b, 0);
    const average = sum / latencies.length;
    const min = latencies[0];
    const max = latencies[latencies.length - 1];

    const p50Index = Math.floor(latencies.length * 0.5);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);

    return {
      service,
      current: latencies[latencies.length - 1],
      average: Math.round(average),
      min,
      max,
      p50: latencies[p50Index],
      p95: latencies[p95Index],
      p99: latencies[p99Index],
      count: latencies.length
    };
  }

  getCurrentLatency(service: string): number | null {
    const records = this.latencies.get(service);
    if (!records || records.length === 0) {
      return null;
    }

    return records[records.length - 1].latency;
  }

  getAverageLatency(service: string, last: number = 100): number | null {
    const stats = this.getLatencyStats(service, last);
    return stats ? stats.average : null;
  }

  getAllLatencyStats(): Map<string, LatencyStats> {
    const result = new Map<string, LatencyStats>();

    for (const service of this.latencies.keys()) {
      const stats = this.getLatencyStats(service);
      if (stats) {
        result.set(service, stats);
      }
    }

    return result;
  }

  clearOldRecords(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    let cleared = 0;

    for (const [service, records] of this.latencies.entries()) {
      const before = records.length;
      const filtered = records.filter(r => r.timestamp.getTime() > cutoff);
      this.latencies.set(service, filtered);
      cleared += before - filtered.length;
    }

    if (cleared > 0) {
      logger.info('Cleared old latency records', { count: cleared });
    }

    return cleared;
  }
}

export const latencyService = new LatencyService();
