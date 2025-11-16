export class CronStats {
  private container: HTMLElement;
  private cronStats: any[] = [];

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;
  }

  async initialize(): Promise<void> {
    await this.loadCronStats();
    this.render();
  }

  private async loadCronStats(): Promise<void> {
    try {
      const response = await fetch('http://localhost:3001/api/monitoring/cron', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        this.cronStats = result.data;
        this.updateDisplay();
      }
    } catch (error) {
      console.error('Failed to load cron stats', error);
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="cron-stats">
        <h3>Cron Jobs</h3>
        <div id="cron-list" class="cron-list"></div>
      </div>
    `;

    this.updateDisplay();
  }

  private updateDisplay(): void {
    const list = document.getElementById('cron-list');
    if (!list) return;

    if (this.cronStats.length === 0) {
      list.innerHTML = '<p>No cron job data available</p>';
      return;
    }

    list.innerHTML = this.cronStats.map(cron => {
      const statusClass = cron.isRunning ? 'cron-running' :
                         cron.lastStatus === 'success' ? 'cron-success' :
                         cron.lastStatus === 'failed' ? 'cron-failed' :
                         'cron-unknown';

      const durationMs = cron.lastDuration || 0;
      const durationSec = (durationMs / 1000).toFixed(2);

      return `
        <div class="cron-item ${statusClass}">
          <div class="cron-header">
            <h4>${cron.taskName}</h4>
            ${cron.isRunning ? '<span class="badge badge-running">RUNNING</span>' : ''}
          </div>
          <div class="cron-info">
            <div class="info-row">
              <label>Schedule:</label>
              <code>${cron.schedule}</code>
            </div>
            ${cron.lastRun ? `
              <div class="info-row">
                <label>Last Run:</label>
                <span>${new Date(cron.lastRun).toLocaleString()}</span>
              </div>
            ` : ''}
            ${cron.lastDuration ? `
              <div class="info-row">
                <label>Duration:</label>
                <span>${durationSec}s</span>
              </div>
            ` : ''}
            ${cron.lastStatus ? `
              <div class="info-row">
                <label>Last Status:</label>
                <span class="badge badge-${cron.lastStatus}">${cron.lastStatus.toUpperCase()}</span>
              </div>
            ` : ''}
            <div class="info-row">
              <label>Success Rate:</label>
              <span>${cron.successRate.toFixed(2)}%</span>
            </div>
            <div class="info-row">
              <label>Total Runs:</label>
              <span>${cron.totalRuns}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async refresh(): Promise<void> {
    await this.loadCronStats();
  }
}
