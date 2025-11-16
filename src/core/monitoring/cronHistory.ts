import { dal } from '../db/dal';
import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'CronHistory' });

export interface CronExecution {
  id: string;
  taskName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'running' | 'success' | 'failed';
  error?: string;
  metadata?: Record<string, any>;
}

export interface CronStats {
  taskName: string;
  schedule: string;
  lastRun?: Date;
  lastDuration?: number;
  lastStatus?: 'success' | 'failed';
  nextRun?: Date;
  totalRuns: number;
  successRate: number;
  averageDuration: number;
  isRunning: boolean;
}

export class CronHistory {
  private executions: Map<string, CronExecution[]> = new Map();
  private currentExecutions: Map<string, CronExecution> = new Map();
  private maxHistoryPerTask = 100;

  async startExecution(
    taskName: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    const execution: CronExecution = {
      id: `cron_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      taskName,
      startTime: new Date(),
      status: 'running',
      metadata
    };

    this.currentExecutions.set(taskName, execution);

    logger.info('Cron execution started', { taskName, id: execution.id });

    return execution.id;
  }

  async completeExecution(
    taskName: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    const execution = this.currentExecutions.get(taskName);
    if (!execution) {
      logger.warn('No current execution found for task', { taskName });
      return;
    }

    execution.endTime = new Date();
    execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
    execution.status = success ? 'success' : 'failed';
    if (error) {
      execution.error = error;
    }

    this.currentExecutions.delete(taskName);
    this.recordExecution(taskName, execution);

    // Save to database
    await dal.settings.set(`cron_execution_${execution.id}`, execution);

    logger.info('Cron execution completed', {
      taskName,
      id: execution.id,
      duration: execution.duration,
      status: execution.status
    });
  }

  private recordExecution(taskName: string, execution: CronExecution): void {
    if (!this.executions.has(taskName)) {
      this.executions.set(taskName, []);
    }

    const history = this.executions.get(taskName)!;
    history.push(execution);

    if (history.length > this.maxHistoryPerTask) {
      history.shift();
    }
  }

  getExecutionHistory(taskName: string, last: number = 50): CronExecution[] {
    const history = this.executions.get(taskName);
    if (!history) {
      return [];
    }

    return history.slice(-last);
  }

  getCronStats(
    taskName: string,
    schedule: string,
    nextRun?: Date
  ): CronStats {
    const history = this.executions.get(taskName) || [];
    const currentExecution = this.currentExecutions.get(taskName);

    const completedExecutions = history.filter(
      e => e.status !== 'running'
    );

    const successCount = completedExecutions.filter(
      e => e.status === 'success'
    ).length;

    const successRate =
      completedExecutions.length > 0
        ? (successCount / completedExecutions.length) * 100
        : 0;

    const durations = completedExecutions
      .filter(e => e.duration)
      .map(e => e.duration!);

    const averageDuration =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

    const lastExecution = completedExecutions[completedExecutions.length - 1];

    return {
      taskName,
      schedule,
      lastRun: lastExecution?.startTime,
      lastDuration: lastExecution?.duration,
      lastStatus: lastExecution?.status as 'success' | 'failed' | undefined,
      nextRun,
      totalRuns: completedExecutions.length,
      successRate: Math.round(successRate * 100) / 100,
      averageDuration,
      isRunning: !!currentExecution
    };
  }

  getAllCronStats(): CronStats[] {
    const stats: CronStats[] = [];

    // Add known cron tasks
    const tasks = [
      { name: 'reconciliation', schedule: '0 3 * * *' },
      { name: 'gateway_health_check', schedule: '*/5 * * * *' },
      { name: 'cleanup_old_logs', schedule: '0 0 * * *' },
      { name: 'currency_rate_update', schedule: '0 */6 * * *' }
    ];

    for (const task of tasks) {
      stats.push(this.getCronStats(task.name, task.schedule));
    }

    return stats;
  }

  isRunning(taskName: string): boolean {
    return this.currentExecutions.has(taskName);
  }

  getCurrentExecution(taskName: string): CronExecution | null {
    return this.currentExecutions.get(taskName) || null;
  }

  async loadHistoryFromDatabase(): Promise<void> {
    try {
      const allSettings = await dal.settings.list();
      const cronExecutions = allSettings
        .filter(s => s.key.startsWith('cron_execution_'))
        .map(s => s.value as CronExecution);

      for (const execution of cronExecutions) {
        this.recordExecution(execution.taskName, execution);
      }

      logger.info('Loaded cron history from database', {
        count: cronExecutions.length
      });
    } catch (error) {
      logger.error('Failed to load cron history', error);
    }
  }
}

export const cronHistory = new CronHistory();
