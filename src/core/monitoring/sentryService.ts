import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'SentryService' });

export interface ErrorEvent {
  id: string;
  message: string;
  stack?: string;
  level: 'error' | 'warning' | 'info';
  timestamp: Date;
  context?: {
    user?: string;
    transaction?: string;
    tags?: Record<string, string>;
    extra?: Record<string, any>;
  };
  fingerprint?: string[];
}

export interface ErrorStats {
  totalErrors: number;
  last24h: number;
  last7d: number;
  topErrors: Array<{
    message: string;
    count: number;
    lastSeen: Date;
  }>;
}

export class SentryService {
  private errors: ErrorEvent[] = [];
  private maxErrors = 1000;
  private errorCounts: Map<string, number> = new Map();

  captureException(
    error: Error,
    context?: {
      user?: string;
      transaction?: string;
      tags?: Record<string, string>;
      extra?: Record<string, any>;
    }
  ): string {
    const event: ErrorEvent = {
      id: `error_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      message: error.message,
      stack: error.stack,
      level: 'error',
      timestamp: new Date(),
      context,
      fingerprint: this.generateFingerprint(error)
    };

    this.recordError(event);

    logger.error('Exception captured', {
      eventId: event.id,
      message: error.message,
      ...context
    });

    return event.id;
  }

  captureMessage(
    message: string,
    level: 'error' | 'warning' | 'info' = 'info',
    context?: {
      user?: string;
      transaction?: string;
      tags?: Record<string, string>;
      extra?: Record<string, any>;
    }
  ): string {
    const event: ErrorEvent = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      message,
      level,
      timestamp: new Date(),
      context,
      fingerprint: [message]
    };

    this.recordError(event);

    logger.info('Message captured', {
      eventId: event.id,
      message,
      level,
      ...context
    });

    return event.id;
  }

  private recordError(event: ErrorEvent): void {
    this.errors.push(event);

    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Update error counts
    const key = event.fingerprint?.join(':') || event.message;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);
  }

  private generateFingerprint(error: Error): string[] {
    const fingerprint: string[] = [error.name, error.message];

    if (error.stack) {
      const stackLines = error.stack.split('\n');
      if (stackLines.length > 1) {
        fingerprint.push(stackLines[1].trim());
      }
    }

    return fingerprint;
  }

  getErrorStats(): ErrorStats {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const last24h = this.errors.filter(
      e => e.timestamp.getTime() > oneDayAgo
    ).length;

    const last7d = this.errors.filter(
      e => e.timestamp.getTime() > sevenDaysAgo
    ).length;

    // Get top errors by count
    const errorGroups = new Map<string, { count: number; lastSeen: Date }>();

    for (const error of this.errors) {
      const key = error.fingerprint?.join(':') || error.message;
      const existing = errorGroups.get(key);

      if (existing) {
        existing.count++;
        if (error.timestamp > existing.lastSeen) {
          existing.lastSeen = error.timestamp;
        }
      } else {
        errorGroups.set(key, {
          count: 1,
          lastSeen: error.timestamp
        });
      }
    }

    const topErrors = Array.from(errorGroups.entries())
      .map(([message, data]) => ({
        message,
        ...data
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalErrors: this.errors.length,
      last24h,
      last7d,
      topErrors
    };
  }

  getRecentErrors(last: number = 50): ErrorEvent[] {
    return this.errors.slice(-last);
  }

  getErrorsByLevel(level: 'error' | 'warning' | 'info'): ErrorEvent[] {
    return this.errors.filter(e => e.level === level);
  }

  getErrorsByContext(
    contextKey: string,
    contextValue: string
  ): ErrorEvent[] {
    return this.errors.filter(
      e => e.context?.tags?.[contextKey] === contextValue
    );
  }

  clearErrors(): void {
    this.errors = [];
    this.errorCounts.clear();
    logger.info('Error history cleared');
  }

  setMaxErrors(max: number): void {
    this.maxErrors = max;
    if (this.errors.length > max) {
      this.errors = this.errors.slice(-max);
    }
  }
}

export const sentryService = new SentryService();
