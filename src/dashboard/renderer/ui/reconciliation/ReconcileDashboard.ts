import { io, Socket } from 'socket.io-client';

interface ReconcileStatus {
  isRunning: boolean;
  currentJob: any;
  config: any;
  queueStatus: any;
}

interface ReconcileStats {
  total: number;
  resolved: number;
  unresolved: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byProvider: Record<string, number>;
}

export class ReconcileDashboard {
  private container: HTMLElement;
  private socket: Socket | null = null;
  private status: ReconcileStatus | null = null;
  private stats: ReconcileStats | null = null;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;
  }

  async initialize(): Promise<void> {
    // Connect to Socket.io server for real-time updates
    this.socket = io('http://localhost:3002');

    // Listen for reconciliation events
    this.socket.on('reconcile:start', (data) => {
      this.onReconcileStart(data);
    });

    this.socket.on('reconcile:progress', (data) => {
      this.onReconcileProgress(data);
    });

    this.socket.on('reconcile:complete', (data) => {
      this.onReconcileComplete(data);
    });

    this.socket.on('reconcile:failed', (data) => {
      this.onReconcileFailed(data);
    });

    this.socket.on('reconcile:mismatch', (data) => {
      this.onMismatchDetected(data);
    });

    // Load initial data
    await this.loadStatus();
    await this.loadStats();

    // Render UI
    this.render();
  }

  private async loadStatus(): Promise<void> {
    try {
      const response = await fetch('http://localhost:3001/api/reconciliation/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        this.status = result.data;
      }
    } catch (error) {
      console.error('Failed to load reconciliation status', error);
    }
  }

  private async loadStats(): Promise<void> {
    try {
      const response = await fetch('http://localhost:3001/api/reconciliation/mismatches/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        this.stats = result.data;
      }
    } catch (error) {
      console.error('Failed to load mismatch stats', error);
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="reconcile-dashboard">
        <div class="dashboard-header">
          <h2>Reconciliation Dashboard</h2>
          <button id="manual-reconcile-btn" class="btn btn-primary">
            Run Manual Reconciliation
          </button>
        </div>

        <div class="status-section">
          <h3>Current Status</h3>
          <div id="status-content">
            ${this.renderStatus()}
          </div>
        </div>

        <div class="stats-section">
          <h3>Mismatch Statistics</h3>
          <div id="stats-content">
            ${this.renderStats()}
          </div>
        </div>

        <div class="progress-section" id="progress-section" style="display: none;">
          <h3>Reconciliation Progress</h3>
          <div class="progress-bar">
            <div id="progress-fill" class="progress-fill" style="width: 0%"></div>
          </div>
          <p id="progress-text">0%</p>
        </div>

        <div class="config-section">
          <h3>Configuration</h3>
          <div id="config-content">
            ${this.renderConfig()}
          </div>
        </div>
      </div>
    `;

    // Attach event listeners
    const manualBtn = document.getElementById('manual-reconcile-btn');
    if (manualBtn) {
      manualBtn.addEventListener('click', () => this.runManualReconciliation());
    }
  }

  private renderStatus(): string {
    if (!this.status) {
      return '<p>Loading...</p>';
    }

    const statusClass = this.status.isRunning ? 'status-running' : 'status-idle';

    return `
      <div class="status-card ${statusClass}">
        <p><strong>Status:</strong> ${this.status.isRunning ? 'Running' : 'Idle'}</p>
        ${this.status.currentJob ? `
          <p><strong>Job ID:</strong> ${this.status.currentJob.id}</p>
          <p><strong>Type:</strong> ${this.status.currentJob.type}</p>
          <p><strong>Started:</strong> ${new Date(this.status.currentJob.startedAt).toLocaleString()}</p>
        ` : ''}
      </div>
      <div class="queue-status">
        <p><strong>Queue Status:</strong></p>
        <ul>
          <li>Waiting: ${this.status.queueStatus.waiting}</li>
          <li>Active: ${this.status.queueStatus.active}</li>
          <li>Completed: ${this.status.queueStatus.completed}</li>
          <li>Failed: ${this.status.queueStatus.failed}</li>
        </ul>
      </div>
    `;
  }

  private renderStats(): string {
    if (!this.stats) {
      return '<p>Loading...</p>';
    }

    return `
      <div class="stats-grid">
        <div class="stat-card">
          <h4>Total Mismatches</h4>
          <p class="stat-number">${this.stats.total}</p>
        </div>
        <div class="stat-card">
          <h4>Unresolved</h4>
          <p class="stat-number stat-warning">${this.stats.unresolved}</p>
        </div>
        <div class="stat-card">
          <h4>Resolved</h4>
          <p class="stat-number stat-success">${this.stats.resolved}</p>
        </div>
      </div>

      <div class="stats-breakdown">
        <div class="breakdown-section">
          <h4>By Type</h4>
          <ul>
            ${Object.entries(this.stats.byType).map(([type, count]) => `
              <li>${type}: ${count}</li>
            `).join('')}
          </ul>
        </div>

        <div class="breakdown-section">
          <h4>By Severity</h4>
          <ul>
            ${Object.entries(this.stats.bySeverity).map(([severity, count]) => `
              <li class="severity-${severity}">${severity}: ${count}</li>
            `).join('')}
          </ul>
        </div>

        <div class="breakdown-section">
          <h4>By Provider</h4>
          <ul>
            ${Object.entries(this.stats.byProvider).map(([provider, count]) => `
              <li>${provider}: ${count}</li>
            `).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  private renderConfig(): string {
    if (!this.status?.config) {
      return '<p>Loading...</p>';
    }

    const config = this.status.config;

    return `
      <div class="config-details">
        <p><strong>Enabled:</strong> ${config.enabled ? 'Yes' : 'No'}</p>
        <p><strong>Schedule:</strong> ${config.cronSchedule}</p>
        <p><strong>Lookback Days:</strong> ${config.lookbackDays}</p>
        <p><strong>Batch Size:</strong> ${config.batchSize}</p>
        <p><strong>Max Concurrency:</strong> ${config.maxConcurrency}</p>
      </div>
    `;
  }

  private async runManualReconciliation(): Promise<void> {
    if (this.status?.isRunning) {
      alert('Reconciliation is already running');
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/reconciliation/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({
          adminId: localStorage.getItem('adminId'),
          adminUsername: localStorage.getItem('adminUsername')
        })
      });

      const result = await response.json();

      if (result.success) {
        alert('Manual reconciliation started');
        await this.loadStatus();
        this.render();
      } else {
        alert(`Failed to start reconciliation: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to start reconciliation', error);
      alert('Failed to start reconciliation');
    }
  }

  private onReconcileStart(data: any): void {
    console.log('Reconciliation started', data);
    this.loadStatus();

    const progressSection = document.getElementById('progress-section');
    if (progressSection) {
      progressSection.style.display = 'block';
    }
  }

  private onReconcileProgress(data: any): void {
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    if (progressFill) {
      progressFill.style.width = `${data.percentage}%`;
    }

    if (progressText) {
      progressText.textContent = `${data.percentage}% - ${data.status}`;
    }
  }

  private onReconcileComplete(data: any): void {
    console.log('Reconciliation completed', data);
    this.loadStatus();
    this.loadStats();
    this.render();

    const progressSection = document.getElementById('progress-section');
    if (progressSection) {
      progressSection.style.display = 'none';
    }

    alert(`Reconciliation completed: ${data.mismatchCount} mismatches found`);
  }

  private onReconcileFailed(data: any): void {
    console.error('Reconciliation failed', data);
    this.loadStatus();

    const progressSection = document.getElementById('progress-section');
    if (progressSection) {
      progressSection.style.display = 'none';
    }

    alert(`Reconciliation failed: ${data.error}`);
  }

  private onMismatchDetected(data: any): void {
    console.warn('Mismatch detected', data);

    // Optionally show notification for critical mismatches
    if (data.severity === 'critical') {
      // Show notification
    }
  }

  destroy(): void {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
