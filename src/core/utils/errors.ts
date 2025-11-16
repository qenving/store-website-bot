export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: any) {
    super('DB_ERROR', message, 500, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      'NOT_FOUND',
      `${resource}${id ? ` with id ${id}` : ''} not found`,
      404
    );
  }
}

export class PaymentError extends AppError {
  constructor(message: string, details?: any) {
    super('PAYMENT_ERROR', message, 500, details);
  }
}

export class TransactionError extends AppError {
  constructor(message: string, details?: any) {
    super('TRANSACTION_ERROR', message, 500, details);
  }
}

export class ConfigError extends AppError {
  constructor(message: string, details?: any) {
    super('CONFIG_ERROR', message, 500, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
  }
}

export function isAppError(error: any): error is AppError {
  return error instanceof AppError;
}

export function formatError(error: unknown): { code: string; message: string; details?: any } {
  if (isAppError(error)) {
    return {
      code: error.code,
      message: error.message,
      details: error.details
    };
  }

  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred'
  };
}
