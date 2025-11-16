import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { createLogger } from '../logging/logger';
import { getConfig } from '../config/config';

const logger = createLogger({ module: 'MessageBroker' });

export type MessageHandler<T = any> = (message: T) => Promise<void> | void;

export interface Message<T = any> {
  id: string;
  channel: string;
  data: T;
  timestamp: Date;
  sender: string;
}

export interface BrokerStats {
  published: number;
  received: number;
  subscriptions: number;
  channels: string[];
}

/**
 * Redis Pub/Sub Message Broker
 * Enables inter-process communication across distributed instances
 */
export class MessageBroker extends EventEmitter {
  private publisher: Redis;
  private subscriber: Redis;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private stats: BrokerStats = {
    published: 0,
    received: 0,
    subscriptions: 0,
    channels: []
  };
  private instanceId: string;

  constructor(publisher?: Redis, subscriber?: Redis) {
    super();

    this.instanceId = `${process.pid}_${Date.now()}`;

    if (publisher && subscriber) {
      this.publisher = publisher;
      this.subscriber = subscriber;
    } else {
      const config = getConfig().redis;
      const options = {
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        }
      };

      this.publisher = new Redis(options);
      this.subscriber = new Redis(options);
    }

    this.setupSubscriberHandlers();
  }

  /**
   * Setup Redis subscriber event handlers
   */
  private setupSubscriberHandlers(): void {
    this.subscriber.on('message', (channel: string, message: string) => {
      this.handleMessage(channel, message).catch(error => {
        logger.error(`Error handling message on channel ${channel}`, error);
      });
    });

    this.subscriber.on('subscribe', (channel: string, count: number) => {
      logger.info(`Subscribed to channel: ${channel}`, { totalSubscriptions: count });
    });

    this.subscriber.on('unsubscribe', (channel: string, count: number) => {
      logger.info(`Unsubscribed from channel: ${channel}`, { remainingSubscriptions: count });
    });

    this.subscriber.on('error', (error) => {
      logger.error('Subscriber error', error);
      this.emit('error', error);
    });
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(channel: string, rawMessage: string): Promise<void> {
    try {
      const message: Message = JSON.parse(rawMessage);

      // Skip messages from self
      if (message.sender === this.instanceId) {
        return;
      }

      this.stats.received++;

      logger.debug(`Message received on channel ${channel}`, {
        messageId: message.id,
        sender: message.sender
      });

      // Call all handlers for this channel
      const handlers = this.handlers.get(channel);

      if (handlers && handlers.size > 0) {
        const promises = Array.from(handlers).map(handler =>
          Promise.resolve(handler(message.data))
        );

        await Promise.allSettled(promises);
      }

      this.emit('message', message);
    } catch (error) {
      logger.error(`Error processing message on channel ${channel}`, error);
    }
  }

  /**
   * Subscribe to a channel
   */
  async subscribe<T = any>(channel: string, handler: MessageHandler<T>): Promise<void> {
    try {
      // Add handler
      let handlers = this.handlers.get(channel);

      if (!handlers) {
        handlers = new Set();
        this.handlers.set(channel, handlers);

        // Subscribe to Redis channel
        await this.subscriber.subscribe(channel);

        this.stats.channels.push(channel);
      }

      handlers.add(handler as MessageHandler);
      this.stats.subscriptions++;

      logger.info(`Subscribed to channel: ${channel}`, {
        handlers: handlers.size
      });
    } catch (error) {
      logger.error(`Error subscribing to channel ${channel}`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: string, handler?: MessageHandler): Promise<void> {
    try {
      const handlers = this.handlers.get(channel);

      if (!handlers) {
        return;
      }

      if (handler) {
        // Remove specific handler
        handlers.delete(handler);
        this.stats.subscriptions = Math.max(0, this.stats.subscriptions - 1);

        if (handlers.size === 0) {
          this.handlers.delete(channel);
          await this.subscriber.unsubscribe(channel);

          const index = this.stats.channels.indexOf(channel);
          if (index > -1) {
            this.stats.channels.splice(index, 1);
          }
        }
      } else {
        // Remove all handlers for channel
        const count = handlers.size;
        this.handlers.delete(channel);
        this.stats.subscriptions = Math.max(0, this.stats.subscriptions - count);

        await this.subscriber.unsubscribe(channel);

        const index = this.stats.channels.indexOf(channel);
        if (index > -1) {
          this.stats.channels.splice(index, 1);
        }
      }

      logger.info(`Unsubscribed from channel: ${channel}`);
    } catch (error) {
      logger.error(`Error unsubscribing from channel ${channel}`, error);
      throw error;
    }
  }

  /**
   * Publish message to a channel
   */
  async publish<T = any>(channel: string, data: T): Promise<void> {
    try {
      const message: Message<T> = {
        id: this.generateMessageId(),
        channel,
        data,
        timestamp: new Date(),
        sender: this.instanceId
      };

      const serialized = JSON.stringify(message);

      await this.publisher.publish(channel, serialized);

      this.stats.published++;

      logger.debug(`Message published to channel ${channel}`, {
        messageId: message.id
      });

      this.emit('published', message);
    } catch (error) {
      logger.error(`Error publishing to channel ${channel}`, error);
      throw error;
    }
  }

  /**
   * Subscribe to pattern
   */
  async psubscribe<T = any>(pattern: string, handler: MessageHandler<T>): Promise<void> {
    try {
      // Add handler for pattern
      let handlers = this.handlers.get(pattern);

      if (!handlers) {
        handlers = new Set();
        this.handlers.set(pattern, handlers);

        // Subscribe to Redis pattern
        await this.subscriber.psubscribe(pattern);

        this.stats.channels.push(pattern);
      }

      handlers.add(handler as MessageHandler);
      this.stats.subscriptions++;

      logger.info(`Pattern subscribed: ${pattern}`, {
        handlers: handlers.size
      });
    } catch (error) {
      logger.error(`Error subscribing to pattern ${pattern}`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from pattern
   */
  async punsubscribe(pattern: string, handler?: MessageHandler): Promise<void> {
    try {
      const handlers = this.handlers.get(pattern);

      if (!handlers) {
        return;
      }

      if (handler) {
        handlers.delete(handler);
        this.stats.subscriptions = Math.max(0, this.stats.subscriptions - 1);

        if (handlers.size === 0) {
          this.handlers.delete(pattern);
          await this.subscriber.punsubscribe(pattern);

          const index = this.stats.channels.indexOf(pattern);
          if (index > -1) {
            this.stats.channels.splice(index, 1);
          }
        }
      } else {
        const count = handlers.size;
        this.handlers.delete(pattern);
        this.stats.subscriptions = Math.max(0, this.stats.subscriptions - count);

        await this.subscriber.punsubscribe(pattern);

        const index = this.stats.channels.indexOf(pattern);
        if (index > -1) {
          this.stats.channels.splice(index, 1);
        }
      }

      logger.info(`Pattern unsubscribed: ${pattern}`);
    } catch (error) {
      logger.error(`Error unsubscribing from pattern ${pattern}`, error);
      throw error;
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `${this.instanceId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get active channels
   */
  getChannels(): string[] {
    return [...this.stats.channels];
  }

  /**
   * Get broker statistics
   */
  getStats(): BrokerStats {
    return { ...this.stats };
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    logger.info('Closing message broker...');

    // Unsubscribe from all channels
    const channels = this.getChannels();
    for (const channel of channels) {
      await this.unsubscribe(channel);
    }

    await Promise.all([
      this.publisher.quit(),
      this.subscriber.quit()
    ]);

    logger.info('Message broker closed');
  }
}

// Singleton instance
let messageBroker: MessageBroker | null = null;

export function getMessageBroker(): MessageBroker {
  if (!messageBroker) {
    messageBroker = new MessageBroker();
  }

  return messageBroker;
}

export function createMessageBroker(publisher?: Redis, subscriber?: Redis): MessageBroker {
  return new MessageBroker(publisher, subscriber);
}
