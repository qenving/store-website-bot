export class ReportViewer {
  private container: HTMLElement;
  private reports: string[] = [];
  private currentReport: any = null;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;
  }

  async initialize(): Promise<void> {
    await this.loadReports();
    this.render();
  }

  private async loadReports(): Promise<void> {
    try {
      const response = await fetch('http://localhost:3001/api/reconciliation/reports?limit=30', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        this.reports = result.data;
      }
    } catch (error) {
      console.error('Failed to load reports', error);
    }
  }

  private async loadReport(date: string): Promise<void> {
    try {
      const response = await fetch(`http://localhost:3001/api/reconciliation/reports/${date}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        this.currentReport = result.data;
        this.renderReportDetails();
      }
    } catch (error) {
      console.error('Failed to load report', error);
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="report-viewer">
        <div class="report-header">
          <h2>Reconciliation Reports</h2>
        </div>

        <div class="report-list">
          <h3>Available Reports</h3>
          <div id="report-list-content">
            ${this.renderReportList()}
          </div>
        </div>

        <div class="report-details" id="report-details" style="display: none;">
          <h3>Report Details</h3>
          <div id="report-details-content"></div>
        </div>
      </div>
    `;

    // Attach event listeners
    this.attachListeners();
  }

  private renderReportList(): string {
    if (this.reports.length === 0) {
      return '<p>No reports available</p>';
    }

    return `
      <table class="report-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${this.reports.map(date => `
            <tr>
              <td>${date}</td>
              <td>
                <button class="btn btn-sm view-report-btn" data-date="${date}">View</button>
                <button class="btn btn-sm download-json-btn" data-date="${date}">JSON</button>
                <button class="btn btn-sm download-csv-btn" data-date="${date}">CSV</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  private renderReportDetails(): void {
    const detailsSection = document.getElementById('report-details');
    const detailsContent = document.getElementById('report-details-content');

    if (!detailsSection || !detailsContent || !this.currentReport) {
      return;
    }

    detailsSection.style.display = 'block';

    const report = this.currentReport;
    const duration = new Date(report.endTime).getTime() - new Date(report.startTime).getTime();
    const durationSeconds = Math.round(duration / 1000);

    detailsContent.innerHTML = `
      <div class="report-summary">
        <h4>Summary</h4>
        <div class="summary-grid">
          <div class="summary-item">
            <label>Report ID:</label>
            <span>${report.id}</span>
          </div>
          <div class="summary-item">
            <label>Type:</label>
            <span class="badge badge-${report.runType}">${report.runType}</span>
          </div>
          <div class="summary-item">
            <label>Status:</label>
            <span class="badge badge-${report.status}">${report.status}</span>
          </div>
          <div class="summary-item">
            <label>Started:</label>
            <span>${new Date(report.startTime).toLocaleString()}</span>
          </div>
          <div class="summary-item">
            <label>Completed:</label>
            <span>${report.endTime ? new Date(report.endTime).toLocaleString() : 'N/A'}</span>
          </div>
          <div class="summary-item">
            <label>Duration:</label>
            <span>${durationSeconds}s</span>
          </div>
          <div class="summary-item">
            <label>Total Transactions:</label>
            <span>${report.totalTransactions}</span>
          </div>
          <div class="summary-item">
            <label>Checked:</label>
            <span>${report.checkedTransactions}</span>
          </div>
          <div class="summary-item">
            <label>Matched:</label>
            <span class="text-success">${report.matchedTransactions}</span>
          </div>
          <div class="summary-item">
            <label>Mismatches:</label>
            <span class="text-warning">${report.mismatchCount}</span>
          </div>
          <div class="summary-item">
            <label>Errors:</label>
            <span class="text-danger">${report.errorCount}</span>
          </div>
          ${report.triggeredBy ? `
            <div class="summary-item">
              <label>Triggered By:</label>
              <span>${report.triggeredBy}</span>
            </div>
          ` : ''}
        </div>
      </div>

      ${report.mismatchCount > 0 ? `
        <div class="report-breakdown">
          <h4>Breakdown</h4>
          <div class="breakdown-grid">
            <div class="breakdown-section">
              <h5>By Type</h5>
              <ul>
                ${Object.entries(report.summary.byType).map(([type, count]) => `
                  <li>${type}: ${count}</li>
                `).join('')}
              </ul>
            </div>

            <div class="breakdown-section">
              <h5>By Severity</h5>
              <ul>
                ${Object.entries(report.summary.bySeverity).map(([severity, count]) => `
                  <li class="severity-${severity}">${severity}: ${count}</li>
                `).join('')}
              </ul>
            </div>

            <div class="breakdown-section">
              <h5>By Provider</h5>
              <ul>
                ${Object.entries(report.summary.byProvider).map(([provider, count]) => `
                  <li>${provider}: ${count}</li>
                `).join('')}
              </ul>
            </div>
          </div>
        </div>

        <div class="mismatches-list">
          <h4>Mismatches (${report.mismatches.length})</h4>
          <table class="mismatch-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Severity</th>
                <th>Transaction ID</th>
                <th>Provider</th>
                <th>Local Status</th>
                <th>Provider Status</th>
                <th>Recommended Action</th>
              </tr>
            </thead>
            <tbody>
              ${report.mismatches.slice(0, 50).map((m: any) => `
                <tr>
                  <td>${m.type}</td>
                  <td><span class="badge badge-${m.severity}">${m.severity}</span></td>
                  <td><code>${m.transactionId.substring(0, 8)}...</code></td>
                  <td>${m.provider}</td>
                  <td>${m.localStatus}</td>
                  <td>${m.providerStatus || 'N/A'}</td>
                  <td class="recommended-action">${m.recommendedAction}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${report.mismatches.length > 50 ? `
            <p class="text-muted">Showing first 50 of ${report.mismatches.length} mismatches</p>
          ` : ''}
        </div>
      ` : '<p class="text-success">No mismatches found!</p>'}

      ${report.errorCount > 0 ? `
        <div class="errors-list">
          <h4>Errors (${report.errors.length})</h4>
          <ul>
            ${report.errors.slice(0, 10).map((err: any) => `
              <li>
                <strong>Transaction:</strong> ${err.transactionId}<br>
                <strong>Error:</strong> ${err.error}<br>
                <strong>Time:</strong> ${new Date(err.timestamp).toLocaleString()}
              </li>
            `).join('')}
          </ul>
          ${report.errors.length > 10 ? `
            <p class="text-muted">Showing first 10 of ${report.errors.length} errors</p>
          ` : ''}
        </div>
      ` : ''}
    `;
  }

  private attachListeners(): void {
    // View report buttons
    document.querySelectorAll('.view-report-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const date = (e.target as HTMLElement).getAttribute('data-date');
        if (date) {
          this.loadReport(date);
        }
      });
    });

    // Download JSON buttons
    document.querySelectorAll('.download-json-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const date = (e.target as HTMLElement).getAttribute('data-date');
        if (date) {
          this.downloadReport(date, 'json');
        }
      });
    });

    // Download CSV buttons
    document.querySelectorAll('.download-csv-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const date = (e.target as HTMLElement).getAttribute('data-date');
        if (date) {
          this.downloadReport(date, 'csv');
        }
      });
    });
  }

  private async downloadReport(date: string, format: 'json' | 'csv'): Promise<void> {
    try {
      const url = `http://localhost:3001/api/reconciliation/reports/${date}/download?format=${format}`;

      // Create a temporary link and click it
      const link = document.createElement('a');
      link.href = url;
      link.download = `reconciliation_${date}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to download report', error);
      alert('Failed to download report');
    }
  }
}
