import winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';

const logsDir = path.join(process.cwd(), 'logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logLevel = process.env.LOG_LEVEL || 'info';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5
    }),
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
});

export interface LogContext {
  module?: string;
  userId?: string;
  transactionId?: string;
  orderId?: string;
  [key: string]: any;
}

export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  private formatMessage(message: string, meta?: any): [string, any] {
    const combinedMeta = { ...this.context, ...meta };
    return [message, combinedMeta];
  }

  info(message: string, meta?: any): void {
    const [msg, combinedMeta] = this.formatMessage(message, meta);
    logger.info(msg, combinedMeta);
  }

  error(message: string, error?: Error | any, meta?: any): void {
    const [msg, combinedMeta] = this.formatMessage(message, meta);
    if (error instanceof Error) {
      logger.error(msg, { ...combinedMeta, error: error.message, stack: error.stack });
    } else if (error) {
      logger.error(msg, { ...combinedMeta, error });
    } else {
      logger.error(msg, combinedMeta);
    }
  }

  warn(message: string, meta?: any): void {
    const [msg, combinedMeta] = this.formatMessage(message, meta);
    logger.warn(msg, combinedMeta);
  }

  debug(message: string, meta?: any): void {
    const [msg, combinedMeta] = this.formatMessage(message, meta);
    logger.debug(msg, combinedMeta);
  }

  child(context: LogContext): Logger {
    return new Logger({ ...this.context, ...context });
  }
}

export const createLogger = (context: LogContext = {}): Logger => {
  return new Logger(context);
};

export const rootLogger = new Logger();
