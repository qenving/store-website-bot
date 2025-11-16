import { createLogger } from '../../logging/logger';

const logger = createLogger({ module: 'HTTPClient' });

export interface HTTPClientOptions {
  timeout?: number;
  headers?: Record<string, string>;
  retries?: number;
}

export class HTTPClient {
  private defaultTimeout = 30000;

  async post<T = any>(
    url: string,
    data: any,
    options: HTTPClientOptions = {}
  ): Promise<T> {
    const timeout = options.timeout || this.defaultTimeout;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('HTTP POST failed', error, { url });
      throw error;
    }
  }

  async get<T = any>(
    url: string,
    options: HTTPClientOptions = {}
  ): Promise<T> {
    const timeout = options.timeout || this.defaultTimeout;
    const headers = {
      ...options.headers
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('HTTP GET failed', error, { url });
      throw error;
    }
  }
}

export const httpClient = new HTTPClient();
