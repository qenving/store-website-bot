export class HealthOverview {
  private container: HTMLElement;
  private health: any = null;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;
  }

  async initialize(): Promise<void> {
    await this.loadHealth();
    this.render();
  }

  private async loadHealth(): Promise<void> {
    try {
      const response = await fetch('http://localhost:3001/api/monitoring/health', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        this.health = result.data;
        this.updateDisplay();
      }
    } catch (error) {
      console.error('Failed to load health', error);
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="health-overview">
        <div id="health-summary" class="health-summary"></div>
      </div>
    `;

    this.updateDisplay();
  }

  private updateDisplay(): void {
    const summary = document.getElementById('health-summary');
    if (!summary || !this.health) return;

    const gatewayCount = Object.keys(this.health.paymentGateways || {}).length;
    const gatewaysUp = Object.values(this.health.paymentGateways || {})
      .filter((g: any) => g.status === 'ok').length;

    const queueCount = Object.keys(this.health.queues || {}).length;
    const totalWaiting = Object.values(this.health.queues || {})
      .reduce((sum: number, q: any) => sum + (q.waiting || 0), 0);

    const totalFailed = Object.values(this.health.queues || {})
      .reduce((sum: number, q: any) => sum + (q.failed || 0), 0);

    summary.innerHTML = `
      <div class="summary-grid">
        <div class="summary-card">
          <h4>System Status</h4>
          <div class="status-large status-${this.health.status}">
            ${this.health.status.toUpperCase()}
          </div>
        </div>

        <div class="summary-card">
          <h4>Services</h4>
          <div class="service-summary">
            <div class="service-item">
              <span>Bot:</span>
              <span class="status-badge status-${this.health.bot.status}">
                ${this.health.bot.status.toUpperCase()}
              </span>
            </div>
            <div class="service-item">
              <span>API:</span>
              <span class="status-badge status-${this.health.api.status}">
                ${this.health.api.status.toUpperCase()}
              </span>
            </div>
            <div class="service-item">
              <span>Database:</span>
              <span class="status-badge status-${this.health.database.status}">
                ${this.health.database.status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <div class="summary-card">
          <h4>Payment Gateways</h4>
          <p class="summary-value">${gatewaysUp} / ${gatewayCount} UP</p>
        </div>

        <div class="summary-card">
          <h4>Queue Status</h4>
          <p class="summary-value">${totalWaiting} Waiting</p>
          ${totalFailed > 0 ? `<p class="summary-value text-danger">${totalFailed} Failed</p>` : ''}
        </div>
      </div>
    `;
  }

  async refresh(): Promise<void> {
    await this.loadHealth();
  }
}
