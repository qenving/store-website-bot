import * as fs from 'fs/promises';
import * as path from 'path';
import { ReconciliationReport, Mismatch, MismatchType } from './types';
import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'ReconcileReporter' });

export class ReconcileReporter {
  private reportsDir: string;

  constructor() {
    this.reportsDir = path.join(process.cwd(), 'storage', 'reconciliation');
  }

  async saveReport(report: ReconciliationReport): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(this.reportsDir, { recursive: true });

      const dateStr = this.getDateString(report.startTime);
      const reportPath = path.join(this.reportsDir, `${dateStr}.json`);

      // Save JSON report
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');

      logger.info('Report saved', { reportId: report.id, path: reportPath });

      // Also save CSV if there are mismatches
      if (report.mismatches.length > 0) {
        await this.saveCSVReport(report, dateStr);
      }
    } catch (error) {
      logger.error('Failed to save report', error);
      throw error;
    }
  }

  async getReport(date: string): Promise<ReconciliationReport | null> {
    try {
      const reportPath = path.join(this.reportsDir, `${date}.json`);
      const content = await fs.readFile(reportPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.warn('Report not found', { date });
      return null;
    }
  }

  async listReports(limit: number = 30): Promise<string[]> {
    try {
      await fs.mkdir(this.reportsDir, { recursive: true });
      const files = await fs.readdir(this.reportsDir);

      const jsonFiles = files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''))
        .sort()
        .reverse()
        .slice(0, limit);

      return jsonFiles;
    } catch (error) {
      logger.error('Failed to list reports', error);
      return [];
    }
  }

  async getLatestReport(): Promise<ReconciliationReport | null> {
    const reports = await this.listReports(1);
    if (reports.length === 0) return null;
    return this.getReport(reports[0]);
  }

  async saveCSVReport(report: ReconciliationReport, dateStr: string): Promise<void> {
    try {
      const csvPath = path.join(this.reportsDir, `${dateStr}_mismatches.csv`);

      const headers = [
        'Mismatch ID',
        'Type',
        'Severity',
        'Transaction ID',
        'Order ID',
        'Provider',
        'Local Status',
        'Provider Status',
        'Local Amount',
        'Provider Amount',
        'Currency',
        'Recommended Action',
        'Detected At',
        'Resolved',
        'Resolved By',
        'Resolved At',
        'Notes'
      ];

      const rows = report.mismatches.map(m => [
        m.id,
        m.type,
        m.severity,
        m.transactionId,
        m.orderId,
        m.provider,
        m.localStatus,
        m.providerStatus || 'N/A',
        m.localAmount.toString(),
        m.providerAmount?.toString() || 'N/A',
        m.currency,
        `"${m.recommendedAction.replace(/"/g, '""')}"`,
        m.detectedAt.toISOString(),
        m.resolved ? 'Yes' : 'No',
        m.resolvedBy || '',
        m.resolvedAt?.toISOString() || '',
        m.resolverNotes ? `"${m.resolverNotes.replace(/"/g, '""')}"` : ''
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      await fs.writeFile(csvPath, csv, 'utf-8');

      logger.info('CSV report saved', { path: csvPath });
    } catch (error) {
      logger.error('Failed to save CSV report', error);
    }
  }

  generateSummary(mismatches: Mismatch[]): {
    byType: Record<MismatchType, number>;
    bySeverity: Record<string, number>;
    byProvider: Record<string, number>;
  } {
    const summary = {
      byType: {} as Record<MismatchType, number>,
      bySeverity: {} as Record<string, number>,
      byProvider: {} as Record<string, number>
    };

    // Initialize counters
    Object.values(MismatchType).forEach(type => {
      summary.byType[type] = 0;
    });

    ['low', 'medium', 'high', 'critical'].forEach(severity => {
      summary.bySeverity[severity] = 0;
    });

    // Count mismatches
    for (const mismatch of mismatches) {
      summary.byType[mismatch.type]++;
      summary.bySeverity[mismatch.severity]++;

      if (!summary.byProvider[mismatch.provider]) {
        summary.byProvider[mismatch.provider] = 0;
      }
      summary.byProvider[mismatch.provider]++;
    }

    return summary;
  }

  async deleteOldReports(daysToKeep: number = 90): Promise<number> {
    try {
      const files = await fs.readdir(this.reportsDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.reportsDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      logger.info('Old reports deleted', { count: deletedCount });
      return deletedCount;
    } catch (error) {
      logger.error('Failed to delete old reports', error);
      return 0;
    }
  }

  private getDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

export const reconcileReporter = new ReconcileReporter();
