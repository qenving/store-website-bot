export const IPC_CHANNELS = {
  GET_BOT_STATUS: 'get-bot-status',
  START_BOT: 'start-bot',
  STOP_BOT: 'stop-bot',
  RESTART_BOT: 'restart-bot',
  TOGGLE_MAINTENANCE: 'toggle-maintenance',
  GET_CONFIG: 'get-config',
  GET_PENDING_TRANSACTIONS: 'get-pending-transactions',
  VALIDATE_TOKEN: 'validate-token',
} as const;

export const SOCKET_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  BOT_STATUS: 'bot_status',
  LOG_MESSAGE: 'log_message',
  TRANSACTION_CREATED: 'transaction_created',
  TRANSACTION_UPDATED: 'transaction_updated',
  TRANSACTION_COMPLETED: 'transaction_completed',
  TRANSACTION_FAILED: 'transaction_failed',
} as const;
