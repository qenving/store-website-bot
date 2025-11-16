export class QueueStats {
  private container: HTMLElement;
  private queueHealth: any[] = [];

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;
  }

  async initialize(): Promise<void> {
    await this.loadQueueHealth();
    this.render();
  }

  private async loadQueueHealth(): Promise<void> {
    try {
      const response = await fetch('http://localhost:3001/api/monitoring/queue/health/all', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        this.queueHealth = result.data;
        this.updateDisplay();
      }
    } catch (error) {
      console.error('Failed to load queue health', error);
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="queue-stats">
        <h3>Queue Status</h3>
        <div id="queue-list" class="queue-list"></div>
      </div>
    `;

    this.updateDisplay();
  }

  private updateDisplay(): void {
    const list = document.getElementById('queue-list');
    if (!list) return;

    if (this.queueHealth.length === 0) {
      list.innerHTML = '<p>No queue data available</p>';
      return;
    }

    list.innerHTML = this.queueHealth.map(queue => {
      const healthClass = queue.status === 'healthy' ? 'health-good' :
                         queue.status === 'degraded' ? 'health-degraded' :
                         'health-critical';

      return `
        <div class="queue-item ${healthClass}">
          <div class="queue-header">
            <h4>${queue.name}</h4>
            <span class="queue-status badge-${queue.status}">${queue.status.toUpperCase()}</span>
          </div>
          <div class="queue-metrics">
            <div class="metric-group">
              <div class="metric">
                <label>Waiting:</label>
                <span class="metric-value">${queue.stats.waiting}</span>
              </div>
              <div class="metric">
                <label>Active:</label>
                <span class="metric-value">${queue.stats.active}</span>
              </div>
              <div class="metric">
                <label>Completed:</label>
                <span class="metric-value text-success">${queue.stats.completed}</span>
              </div>
              <div class="metric">
                <label>Failed:</label>
                <span class="metric-value text-danger">${queue.stats.failed}</span>
              </div>
            </div>
            <div class="metric">
              <label>Failure Rate:</label>
              <span class="metric-value">${queue.failureRate.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async refresh(): Promise<void> {
    await this.loadQueueHealth();
  }
}
