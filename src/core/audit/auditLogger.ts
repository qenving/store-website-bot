import { createLogger } from '../logging/logger';
import { dal } from '../db/dal';

const logger = createLogger({ module: 'AuditLogger' });

export enum AuditAction {
  USER_BALANCE_ADD = 'user_balance_add',
  USER_BALANCE_DEDUCT = 'user_balance_deduct',
  USER_BALANCE_RESET = 'user_balance_reset',
  TRANSACTION_REFUND = 'transaction_refund',
  TRANSACTION_FORCE_COMPLETE = 'transaction_force_complete',
  TRANSACTION_MARK_FAILED = 'transaction_mark_failed',
  GATEWAY_TOGGLE = 'gateway_toggle',
  GATEWAY_CONFIG_UPDATE = 'gateway_config_update',
  CURRENCY_RATE_UPDATE = 'currency_rate_update',
  ADMIN_CREATED = 'admin_created',
  ADMIN_DELETED = 'admin_deleted',
  ADMIN_ROLE_CHANGED = 'admin_role_changed',
  BOT_STOPPED = 'bot_stopped',
  BOT_RESTARTED = 'bot_restarted',
  MAINTENANCE_TOGGLED = 'maintenance_toggled',
  RECONCILIATION_RUN = 'reconciliation_run',
  SETTINGS_UPDATED = 'settings_updated'
}

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  adminId: string;
  adminUsername: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  ipAddress?: string;
}

class AuditLoggerClass {
  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const auditEntry: AuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      ...entry,
      timestamp: new Date()
    };

    logger.info('Audit log', auditEntry);

    await dal.settings.set(`audit_log_${auditEntry.id}`, auditEntry);
  }

  async getRecentLogs(limit: number = 100): Promise<AuditLogEntry[]> {
    const logs: AuditLogEntry[] = [];
    return logs;
  }
}

export const auditLogger = new AuditLoggerClass();
