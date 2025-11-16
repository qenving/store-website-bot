import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { transactionEngine } from '../core/transactions/TransactionEngine';
import { RealtimeEvent, TransactionEvent, LogEvent } from '../core/transactions/TransactionTypes';
import { createLogger } from '../core/logging/logger';
import { getConfig } from '../core/config/config';
import { MonitoringEvents } from './events/monitoringEvents';

const logger = createLogger({ module: 'SocketServer' });

export class RealtimeServer {
  private io: SocketIOServer | null = null;
  private httpServer: HTTPServer | null = null;
  private monitoringEvents: MonitoringEvents | null = null;

  initialize(httpServer: HTTPServer): void {
    this.httpServer = httpServer;

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.setupEventListeners();
    this.setupSocketHandlers();

    // Initialize monitoring events
    this.monitoringEvents = new MonitoringEvents(this.io);
    this.monitoringEvents.setupMonitoringEmitters();
    logger.info('Monitoring events initialized');

    logger.info('Realtime server initialized');
  }

  private setupEventListeners(): void {
    transactionEngine.onEvent((event: TransactionEvent) => {
      this.broadcastEvent(event);
    });
  }

  private setupSocketHandlers(): void {
    if (!this.io) {
      throw new Error('Socket.IO not initialized');
    }

    this.io.on('connection', (socket) => {
      logger.info('Client connected', { socketId: socket.id });

      socket.on('subscribe', (data: { channel: string }) => {
        if (data.channel) {
          socket.join(data.channel);
          logger.info('Client subscribed to channel', {
            socketId: socket.id,
            channel: data.channel
          });
        }
      });

      socket.on('unsubscribe', (data: { channel: string }) => {
        if (data.channel) {
          socket.leave(data.channel);
          logger.info('Client unsubscribed from channel', {
            socketId: socket.id,
            channel: data.channel
          });
        }
      });

      socket.on('disconnect', () => {
        logger.info('Client disconnected', { socketId: socket.id });
      });
    });
  }

  broadcastEvent(event: RealtimeEvent): void {
    if (!this.io) {
      logger.warn('Attempted to broadcast event but Socket.IO not initialized');
      return;
    }

    this.io.emit('event', event);

    if ('transaction' in event) {
      this.io.to(`transaction:${event.transaction.id}`).emit('transaction_event', event);
      this.io.to(`user:${event.transaction.userId}`).emit('user_transaction_event', event);
      this.io.to(`order:${event.transaction.orderId}`).emit('order_event', event);
    }

    logger.debug('Event broadcasted', { type: event.type });
  }

  emitLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, metadata?: Record<string, any>): void {
    const event: LogEvent = {
      type: 'log_message',
      level,
      message,
      metadata,
      timestamp: new Date()
    };

    this.broadcastEvent(event);
  }

  getIO(): SocketIOServer | null {
    return this.io;
  }

  close(): void {
    if (this.io) {
      this.io.close();
      logger.info('Realtime server closed');
    }
  }
}

export const realtimeServer = new RealtimeServer();

export async function startRealtimeServer(): Promise<void> {
  const config = getConfig();
  const http = require('http');

  const httpServer = http.createServer();

  realtimeServer.initialize(httpServer);

  return new Promise((resolve) => {
    httpServer.listen(config.socket.port, config.socket.host, () => {
      logger.info(`Realtime server started`, {
        host: config.socket.host,
        port: config.socket.port
      });
      resolve();
    });
  });
}
