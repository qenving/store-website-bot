import { io, Socket } from 'socket.io-client';

export class MonitoringDashboard {
  private container: HTMLElement;
  private socket: Socket | null = null;
  private systemHealth: any = null;
  private refreshInterval: NodeJS.Timeout | null = null;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;
  }

  async initialize(): Promise<void> {
    // Connect to Socket.io for real-time updates
    this.socket = io('http://localhost:3002');

    // Listen for monitoring events
    this.socket.on('monitoring:update', (data) => {
      this.systemHealth = data;
      this.updateHealthDisplay();
    });

    this.socket.on('monitoring:alert', (alert) => {
      this.showAlert(alert);
    });

    // Load initial data
    await this.loadSystemHealth();

    // Render UI
    this.render();

    // Auto-refresh every 30 seconds
    this.refreshInterval = setInterval(() => {
      this.loadSystemHealth();
    }, 30000);
  }

  private async loadSystemHealth(): Promise<void> {
    try {
      const response = await fetch('http://localhost:3001/api/monitoring/health', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        this.systemHealth = result.data;
        this.updateHealthDisplay();
      }
    } catch (error) {
      console.error('Failed to load system health', error);
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="monitoring-dashboard">
        <div class="dashboard-header">
          <h2>System Monitoring</h2>
          <div class="overall-status" id="overall-status">
            <span class="status-indicator">●</span>
            <span class="status-text">Loading...</span>
          </div>
        </div>

        <div class="services-grid">
          <div class="service-card" id="bot-status">
            <h3>Discord Bot</h3>
            <div class="service-status">Loading...</div>
          </div>

          <div class="service-card" id="website-status">
            <h3>Website</h3>
            <div class="service-status">Loading...</div>
          </div>

          <div class="service-card" id="api-status">
            <h3>API</h3>
            <div class="service-status">Loading...</div>
          </div>

          <div class="service-card" id="database-status">
            <h3>Database</h3>
            <div class="service-status">Loading...</div>
          </div>
        </div>

        <div class="monitoring-tabs">
          <button class="tab-btn active" data-tab="overview">Overview</button>
          <button class="tab-btn" data-tab="gateways">Gateways</button>
          <button class="tab-btn" data-tab="queues">Queues</button>
          <button class="tab-btn" data-tab="crons">Cron Jobs</button>
          <button class="tab-btn" data-tab="performance">Performance</button>
        </div>

        <div class="monitoring-content">
          <div id="tab-overview" class="tab-content active">
            <div id="health-overview"></div>
          </div>
          <div id="tab-gateways" class="tab-content">
            <div id="gateway-stats"></div>
          </div>
          <div id="tab-queues" class="tab-content">
            <div id="queue-stats"></div>
          </div>
          <div id="tab-crons" class="tab-content">
            <div id="cron-stats"></div>
          </div>
          <div id="tab-performance" class="tab-content">
            <div id="performance-charts"></div>
          </div>
        </div>
      </div>
    `;

    // Attach tab listeners
    this.attachTabListeners();
  }

  private attachTabListeners(): void {
    const tabBtns = this.container.querySelectorAll('.tab-btn');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = (e.target as HTMLElement).getAttribute('data-tab');
        if (!tab) return;

        // Update active tab button
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update active content
        const contents = this.container.querySelectorAll('.tab-content');
        contents.forEach(c => c.classList.remove('active'));

        const content = this.container.querySelector(`#tab-${tab}`);
        if (content) {
          content.classList.add('active');
        }
      });
    });
  }

  private updateHealthDisplay(): void {
    if (!this.systemHealth) return;

    // Update overall status
    const overallStatus = document.getElementById('overall-status');
    if (overallStatus) {
      const statusClass = this.systemHealth.status === 'ok' ? 'status-ok' :
                         this.systemHealth.status === 'degraded' ? 'status-degraded' :
                         'status-down';

      overallStatus.className = `overall-status ${statusClass}`;
      overallStatus.innerHTML = `
        <span class="status-indicator">●</span>
        <span class="status-text">${this.systemHealth.status.toUpperCase()}</span>
      `;
    }

    // Update bot status
    this.updateServiceCard('bot-status', 'Discord Bot', this.systemHealth.bot);
    this.updateServiceCard('website-status', 'Website', this.systemHealth.website);
    this.updateServiceCard('api-status', 'API', this.systemHealth.api);
    this.updateServiceCard('database-status', 'Database', this.systemHealth.database);

    // Update health overview
    this.updateHealthOverview();
  }

  private updateServiceCard(cardId: string, name: string, serviceHealth: any): void {
    const card = document.getElementById(cardId);
    if (!card) return;

    const statusClass = serviceHealth.status === 'ok' ? 'status-ok' :
                       serviceHealth.status === 'degraded' ? 'status-degraded' :
                       'status-down';

    let details = '';
    if (serviceHealth.uptime) {
      const uptime = Math.floor(serviceHealth.uptime / 1000 / 60); // minutes
      details += `<p>Uptime: ${uptime}m</p>`;
    }
    if (serviceHealth.latency) {
      details += `<p>Latency: ${serviceHealth.latency}ms</p>`;
    }
    if (serviceHealth.ping) {
      details += `<p>Ping: ${serviceHealth.ping}ms</p>`;
    }
    if (serviceHealth.message) {
      details += `<p class="error-message">${serviceHealth.message}</p>`;
    }

    card.innerHTML = `
      <h3>${name}</h3>
      <div class="service-status ${statusClass}">
        <span class="status-indicator">●</span>
        <span>${serviceHealth.status.toUpperCase()}</span>
      </div>
      ${details}
    `;
  }

  private updateHealthOverview(): void {
    const overview = document.getElementById('health-overview');
    if (!overview || !this.systemHealth) return;

    const gatewayCount = Object.keys(this.systemHealth.paymentGateways || {}).length;
    const queueCount = Object.keys(this.systemHealth.queues || {}).length;

    overview.innerHTML = `
      <div class="overview-grid">
        <div class="overview-item">
          <h4>Payment Gateways</h4>
          <p class="overview-value">${gatewayCount}</p>
        </div>
        <div class="overview-item">
          <h4>Queue Status</h4>
          <p class="overview-value">${queueCount} Active</p>
        </div>
        <div class="overview-item">
          <h4>Last Check</h4>
          <p class="overview-value">${new Date(this.systemHealth.timestamp).toLocaleTimeString()}</p>
        </div>
      </div>
    `;
  }

  private showAlert(alert: any): void {
    const alertClass = alert.severity === 'critical' ? 'alert-critical' :
                      alert.severity === 'error' ? 'alert-error' :
                      alert.severity === 'warning' ? 'alert-warning' :
                      'alert-info';

    const alertDiv = document.createElement('div');
    alertDiv.className = `monitoring-alert ${alertClass}`;
    alertDiv.innerHTML = `
      <strong>${alert.title}</strong>
      <p>${alert.message}</p>
      <button class="close-alert">×</button>
    `;

    this.container.prepend(alertDiv);

    alertDiv.querySelector('.close-alert')?.addEventListener('click', () => {
      alertDiv.remove();
    });

    // Auto-remove after 10 seconds
    setTimeout(() => alertDiv.remove(), 10000);
  }

  destroy(): void {
    if (this.socket) {
      this.socket.disconnect();
    }

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }
}
