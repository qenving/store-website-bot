export type TransactionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Transaction {
  id: string;
  orderId: string;
  userId: string;
  productId: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  paymentMethod?: string;
  paymentLink?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface CreateTransactionInput {
  userId: string;
  productId: string;
  amount: number;
  currency?: string;
  metadata?: Record<string, any>;
}

export interface UpdateTransactionInput {
  status?: TransactionStatus;
  paymentMethod?: string;
  paymentLink?: string;
  metadata?: Record<string, any>;
  completedAt?: Date;
}

export interface User {
  id: string;
  discordId: string;
  username: string;
  email?: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  discordId: string;
  username: string;
  email?: string;
  balance?: number;
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  balance?: number;
}

export interface Balance {
  userId: string;
  amount: number;
  currency: string;
  updatedAt: Date;
}

export interface Setting {
  key: string;
  value: any;
  updatedAt: Date;
}

export interface Admin {
  id: string;
  discordId: string;
  username: string;
  permissions: string[];
  createdAt: Date;
}

export interface PaymentResult {
  success: boolean;
  paymentLink?: string;
  transactionId: string;
  orderId: string;
  message?: string;
}

export interface WebhookPayload {
  orderId: string;
  status: TransactionStatus;
  paymentMethod?: string;
  metadata?: Record<string, any>;
}

export interface TransactionEvent {
  type: 'transaction_created' | 'transaction_updated' | 'transaction_completed' | 'transaction_failed';
  transaction: Transaction;
  timestamp: Date;
}

export interface LogEvent {
  type: 'log_message';
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export type RealtimeEvent = TransactionEvent | LogEvent;
