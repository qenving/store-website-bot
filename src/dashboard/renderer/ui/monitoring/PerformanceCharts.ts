export class PerformanceCharts {
  private container: HTMLElement;
  private metrics: any = null;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;
  }

  async initialize(): Promise<void> {
    await this.loadMetrics();
    this.render();
  }

  private async loadMetrics(): Promise<void> {
    try {
      const response = await fetch('http://localhost:3001/api/monitoring/metrics/json', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        this.metrics = result.data;
        this.updateDisplay();
      }
    } catch (error) {
      console.error('Failed to load metrics', error);
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="performance-charts">
        <h3>System Performance</h3>
        <div id="performance-content" class="performance-content"></div>
      </div>
    `;

    this.updateDisplay();
  }

  private updateDisplay(): void {
    const content = document.getElementById('performance-content');
    if (!content || !this.metrics) return;

    const memoryMB = Math.round(this.metrics.system?.memory?.rss / 1024 / 1024);
    const heapUsedMB = Math.round(this.metrics.system?.memory?.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(this.metrics.system?.memory?.heapTotal / 1024 / 1024);

    const uptimeHours = Math.floor(this.metrics.system?.uptime / 3600);
    const uptimeMinutes = Math.floor((this.metrics.system?.uptime % 3600) / 60);

    content.innerHTML = `
      <div class="performance-grid">
        <div class="performance-card">
          <h4>Memory Usage</h4>
          <div class="performance-value">
            <span class="value-large">${memoryMB} MB</span>
            <span class="value-detail">RSS</span>
          </div>
          <div class="performance-detail">
            <span>Heap Used:</span>
            <span>${heapUsedMB} MB</span>
          </div>
          <div class="performance-detail">
            <span>Heap Total:</span>
            <span>${heapTotalMB} MB</span>
          </div>
        </div>

        <div class="performance-card">
          <h4>System Uptime</h4>
          <div class="performance-value">
            <span class="value-large">${uptimeHours}h ${uptimeMinutes}m</span>
          </div>
          <div class="performance-detail">
            <span>Platform:</span>
            <span>${this.metrics.system?.platform || 'N/A'}</span>
          </div>
          <div class="performance-detail">
            <span>CPU Cores:</span>
            <span>${this.metrics.system?.cpu?.cores || 'N/A'}</span>
          </div>
        </div>

        <div class="performance-card">
          <h4>API Latency</h4>
          <div id="latency-stats"></div>
        </div>

        <div class="performance-card">
          <h4>Service Uptime</h4>
          <div id="uptime-stats"></div>
        </div>
      </div>
    `;

    this.updateLatencyStats();
    this.updateUptimeStats();
  }

  private updateLatencyStats(): void {
    const latencyDiv = document.getElementById('latency-stats');
    if (!latencyDiv || !this.metrics.latency) return;

    const latencyEntries = Object.entries(this.metrics.latency);

    if (latencyEntries.length === 0) {
      latencyDiv.innerHTML = '<p>No latency data</p>';
      return;
    }

    latencyDiv.innerHTML = latencyEntries.map(([service, stats]: [string, any]) => `
      <div class="latency-item">
        <div class="latency-service">${service}:</div>
        <div class="latency-values">
          <span>${stats.average}ms avg</span>
          <span class="text-muted">p95: ${stats.p95}ms</span>
        </div>
      </div>
    `).join('');
  }

  private updateUptimeStats(): void {
    const uptimeDiv = document.getElementById('uptime-stats');
    if (!uptimeDiv || !this.metrics.uptime) return;

    const uptimeEntries = Object.entries(this.metrics.uptime);

    if (uptimeEntries.length === 0) {
      uptimeDiv.innerHTML = '<p>No uptime data</p>';
      return;
    }

    uptimeDiv.innerHTML = uptimeEntries.map(([service, seconds]: [string, any]) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);

      return `
        <div class="uptime-item">
          <span class="uptime-service">${service}:</span>
          <span class="uptime-value">${hours}h ${minutes}m</span>
        </div>
      `;
    }).join('');
  }

  async refresh(): Promise<void> {
    await this.loadMetrics();
  }
}
