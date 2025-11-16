export enum Role {
  OWNER = 'owner',
  ADMIN = 'admin',
  OPERATOR = 'operator',
  AUDITOR = 'auditor'
}

export enum Permission {
  VIEW_DASHBOARD = 'view_dashboard',
  VIEW_LOGS = 'view_logs',
  VIEW_USERS = 'view_users',
  MANAGE_USERS = 'manage_users',
  VIEW_BALANCES = 'view_balances',
  MANAGE_BALANCES = 'manage_balances',
  VIEW_TRANSACTIONS = 'view_transactions',
  MANAGE_TRANSACTIONS = 'manage_transactions',
  REFUND_TRANSACTIONS = 'refund_transactions',
  VIEW_GATEWAYS = 'view_gateways',
  MANAGE_GATEWAYS = 'manage_gateways',
  VIEW_CURRENCY = 'view_currency',
  MANAGE_CURRENCY = 'manage_currency',
  VIEW_RECONCILIATION = 'view_reconciliation',
  RUN_RECONCILIATION = 'run_reconciliation',
  VIEW_ADMINS = 'view_admins',
  MANAGE_ADMINS = 'manage_admins',
  VIEW_SETTINGS = 'view_settings',
  MANAGE_SETTINGS = 'manage_settings',
  BOT_CONTROL = 'bot_control',
  VIEW_AUDIT_LOGS = 'view_audit_logs',
  MANAGE_NOTIFICATIONS = 'manage_notifications'
}

export interface RolePermissions {
  role: Role;
  permissions: Permission[];
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.OWNER]: [
    Permission.VIEW_DASHBOARD,
    Permission.VIEW_LOGS,
    Permission.VIEW_USERS,
    Permission.MANAGE_USERS,
    Permission.VIEW_BALANCES,
    Permission.MANAGE_BALANCES,
    Permission.VIEW_TRANSACTIONS,
    Permission.MANAGE_TRANSACTIONS,
    Permission.REFUND_TRANSACTIONS,
    Permission.VIEW_GATEWAYS,
    Permission.MANAGE_GATEWAYS,
    Permission.VIEW_CURRENCY,
    Permission.MANAGE_CURRENCY,
    Permission.VIEW_RECONCILIATION,
    Permission.RUN_RECONCILIATION,
    Permission.VIEW_ADMINS,
    Permission.MANAGE_ADMINS,
    Permission.VIEW_SETTINGS,
    Permission.MANAGE_SETTINGS,
    Permission.BOT_CONTROL,
    Permission.VIEW_AUDIT_LOGS,
    Permission.MANAGE_NOTIFICATIONS
  ],
  [Role.ADMIN]: [
    Permission.VIEW_DASHBOARD,
    Permission.VIEW_LOGS,
    Permission.VIEW_USERS,
    Permission.MANAGE_USERS,
    Permission.VIEW_BALANCES,
    Permission.MANAGE_BALANCES,
    Permission.VIEW_TRANSACTIONS,
    Permission.MANAGE_TRANSACTIONS,
    Permission.REFUND_TRANSACTIONS,
    Permission.VIEW_GATEWAYS,
    Permission.MANAGE_GATEWAYS,
    Permission.VIEW_CURRENCY,
    Permission.MANAGE_CURRENCY,
    Permission.VIEW_RECONCILIATION,
    Permission.RUN_RECONCILIATION,
    Permission.VIEW_ADMINS,
    Permission.VIEW_SETTINGS,
    Permission.MANAGE_SETTINGS,
    Permission.BOT_CONTROL,
    Permission.VIEW_AUDIT_LOGS,
    Permission.MANAGE_NOTIFICATIONS
  ],
  [Role.OPERATOR]: [
    Permission.VIEW_DASHBOARD,
    Permission.VIEW_LOGS,
    Permission.VIEW_USERS,
    Permission.MANAGE_USERS,
    Permission.VIEW_BALANCES,
    Permission.MANAGE_BALANCES,
    Permission.VIEW_TRANSACTIONS,
    Permission.VIEW_GATEWAYS,
    Permission.VIEW_CURRENCY,
    Permission.VIEW_RECONCILIATION,
    Permission.VIEW_AUDIT_LOGS
  ],
  [Role.AUDITOR]: [
    Permission.VIEW_DASHBOARD,
    Permission.VIEW_LOGS,
    Permission.VIEW_USERS,
    Permission.VIEW_BALANCES,
    Permission.VIEW_TRANSACTIONS,
    Permission.VIEW_GATEWAYS,
    Permission.VIEW_CURRENCY,
    Permission.VIEW_RECONCILIATION,
    Permission.VIEW_AUDIT_LOGS
  ]
};
