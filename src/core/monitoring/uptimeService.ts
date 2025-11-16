import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'UptimeService' });

export interface UptimeData {
  service: string;
  startedAt: Date;
  uptime: number;
  restartCount: number;
  lastRestart?: Date;
}

export class UptimeService {
  private uptimes: Map<string, UptimeData> = new Map();

  registerService(service: string): void {
    if (!this.uptimes.has(service)) {
      this.uptimes.set(service, {
        service,
        startedAt: new Date(),
        uptime: 0,
        restartCount: 0
      });

      logger.info('Service registered for uptime tracking', { service });
    }
  }

  recordRestart(service: string): void {
    const uptime = this.uptimes.get(service);

    if (uptime) {
      uptime.restartCount++;
      uptime.lastRestart = new Date();
      uptime.startedAt = new Date();

      logger.warn('Service restarted', {
        service,
        restartCount: uptime.restartCount
      });
    }
  }

  getUptime(service: string): number {
    const uptime = this.uptimes.get(service);
    if (!uptime) return 0;

    return Date.now() - uptime.startedAt.getTime();
  }

  getUptimeSeconds(service: string): number {
    return Math.floor(this.getUptime(service) / 1000);
  }

  getUptimeData(service: string): UptimeData | null {
    const uptime = this.uptimes.get(service);
    if (!uptime) return null;

    return {
      ...uptime,
      uptime: this.getUptime(service)
    };
  }

  getAllUptimes(): UptimeData[] {
    const result: UptimeData[] = [];

    for (const [service, data] of this.uptimes.entries()) {
      result.push({
        ...data,
        uptime: this.getUptime(service)
      });
    }

    return result;
  }

  getUptimeFormatted(service: string): string {
    const ms = this.getUptime(service);
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

export const uptimeService = new UptimeService();
