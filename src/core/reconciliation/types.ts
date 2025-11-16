import { UnifiedPaymentStatus } from '../payments/paymentTypes';

export enum MismatchType {
  STATUS_MISMATCH = 'status_mismatch',
  AMOUNT_MISMATCH = 'amount_mismatch',
  MISSING_LOCAL = 'missing_local',
  MISSING_PROVIDER = 'missing_provider',
  DUPLICATE_PAYMENT = 'duplicate_payment',
  PROVIDER_ERROR = 'provider_error'
}

export enum ReconcileStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface Mismatch {
  id: string;
  type: MismatchType;
  transactionId: string;
  orderId: string;
  localStatus: UnifiedPaymentStatus;
  providerStatus: string | null;
  localAmount: number;
  providerAmount: number | null;
  currency: string;
  provider: string;
  recommendedAction: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolverNotes?: string;
  metadata?: Record<string, any>;
}

export interface ReconciliationReport {
  id: string;
  runType: 'auto' | 'manual';
  triggeredBy?: string;
  startTime: Date;
  endTime?: Date;
  status: ReconcileStatus;
  totalTransactions: number;
  checkedTransactions: number;
  matchedTransactions: number;
  mismatchCount: number;
  mismatches: Mismatch[];
  errorCount: number;
  errors: Array<{
    transactionId: string;
    error: string;
    timestamp: Date;
  }>;
  summary: {
    byType: Record<MismatchType, number>;
    bySeverity: Record<string, number>;
    byProvider: Record<string, number>;
  };
  metadata?: Record<string, any>;
}

export interface ReconcileJob {
  id: string;
  type: 'auto' | 'manual';
  triggeredBy?: string;
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  status: ReconcileStatus;
  reportId?: string;
  error?: string;
}

export interface ReconcileProgress {
  jobId: string;
  total: number;
  current: number;
  percentage: number;
  currentTransaction?: string;
  status: string;
}

export interface MismatchResolution {
  mismatchId: string;
  action: 'sync_from_provider' | 'force_local_status' | 'mark_as_valid' | 'manual_review' | 'refund' | 'cancel';
  resolvedBy: string;
  notes: string;
  timestamp: Date;
  resultStatus?: UnifiedPaymentStatus;
}

export interface ReconcileConfig {
  enabled: boolean;
  cronSchedule: string;
  batchSize: number;
  maxConcurrency: number;
  lookbackDays: number;
  excludeStatuses: UnifiedPaymentStatus[];
  retryFailedChecks: boolean;
  maxRetries: number;
  notifyOnMismatch: boolean;
  criticalThreshold: number;
}
