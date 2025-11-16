export class GatewayStats {
  private container: HTMLElement;
  private gatewayHealth: Record<string, any> = {};

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;
  }

  async initialize(): Promise<void> {
    await this.loadGatewayHealth();
    this.render();
  }

  private async loadGatewayHealth(): Promise<void> {
    try {
      const response = await fetch('http://localhost:3001/api/monitoring/gateway', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        this.gatewayHealth = result.data;
        this.updateDisplay();
      }
    } catch (error) {
      console.error('Failed to load gateway health', error);
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="gateway-stats">
        <h3>Payment Gateway Health</h3>
        <div id="gateway-list" class="gateway-list"></div>
      </div>
    `;

    this.updateDisplay();
  }

  private updateDisplay(): void {
    const list = document.getElementById('gateway-list');
    if (!list) return;

    const gateways = Object.entries(this.gatewayHealth);

    if (gateways.length === 0) {
      list.innerHTML = '<p>No gateway data available</p>';
      return;
    }

    list.innerHTML = gateways.map(([name, health]) => {
      const statusClass = health.status === 'up' ? 'status-ok' :
                         health.status === 'degraded' ? 'status-degraded' :
                         'status-down';

      return `
        <div class="gateway-item ${statusClass}">
          <div class="gateway-header">
            <h4>${name.toUpperCase()}</h4>
            <span class="gateway-status ${statusClass}">
              <span class="status-indicator">●</span>
              ${health.status.toUpperCase()}
            </span>
          </div>
          <div class="gateway-metrics">
            <div class="metric">
              <label>Latency:</label>
              <span>${health.currentLatency}ms</span>
            </div>
            <div class="metric">
              <label>Avg Latency:</label>
              <span>${health.averageLatency}ms</span>
            </div>
            <div class="metric">
              <label>Uptime 24h:</label>
              <span>${health.uptime24h.toFixed(2)}%</span>
            </div>
            <div class="metric">
              <label>Errors 24h:</label>
              <span>${health.errors24h}</span>
            </div>
          </div>
          <div class="gateway-footer">
            <small>Last check: ${new Date(health.lastCheck).toLocaleString()}</small>
          </div>
        </div>
      `;
    }).join('');
  }

  async refresh(): Promise<void> {
    await this.loadGatewayHealth();
  }
}
