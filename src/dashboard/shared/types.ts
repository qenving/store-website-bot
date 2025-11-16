export interface BotStatus {
  running: boolean;
  uptime: number;
  ping: number | null;
  pendingTransactions: number;
  connectedGuilds: number;
  lastUpdate: Date;
}

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  module: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface TransactionEventData {
  type: 'transaction_created' | 'transaction_updated' | 'transaction_completed' | 'transaction_failed';
  transaction: {
    id: string;
    orderId: string;
    userId: string;
    productId: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: Date;
  };
  timestamp: Date;
}

export interface MaintenanceMode {
  enabled: boolean;
  message?: string;
}

export interface DashboardConfig {
  socketPort: number;
  apiPort: number;
  apiHost: string;
}

export interface IPCResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
