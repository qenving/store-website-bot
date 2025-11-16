export class SecurityCenter {
  private container: HTMLElement;

  constructor(containerId: string) {
    const element = document.getElementById(containerId);
    if (!element) throw new Error(`Container ${containerId} not found`);
    this.container = element;
    this.render();
  }

  private async render() {
    this.container.innerHTML = `
      <div class="security-center">
        <h2>Security Center</h2>
        <div class="security-overview">
          <div class="security-card">
            <h3>Two-Factor Authentication</h3>
            <div id="2fa-status">Loading...</div>
            <button id="setup-2fa-btn">Setup 2FA</button>
          </div>
          <div class="security-card">
            <h3>Active Sessions</h3>
            <div id="sessions-count">Loading...</div>
            <button id="view-sessions-btn">View Sessions</button>
          </div>
          <div class="security-card">
            <h3>API Keys</h3>
            <button id="manage-keys-btn">Manage Keys</button>
          </div>
          <div class="security-card">
            <h3>Security Logs</h3>
            <button id="view-logs-btn">View Logs</button>
          </div>
        </div>
      </div>
    `;
    this.attachEvents();
    await this.loadStatus();
  }

  private attachEvents() {
    document.getElementById('setup-2fa-btn')?.addEventListener('click', () => this.setup2FA());
    document.getElementById('view-sessions-btn')?.addEventListener('click', () => this.viewSessions());
    document.getElementById('manage-keys-btn')?.addEventListener('click', () => this.manageKeys());
    document.getElementById('view-logs-btn')?.addEventListener('click', () => this.viewLogs());
  }

  private async loadStatus() {
    const status = await (window as any).electron.security.getStatus();
    if (status.success) {
      document.getElementById('2fa-status')!.textContent = status.data.twoFactor.enabled ? 'Enabled' : 'Disabled';
      document.getElementById('sessions-count')!.textContent = `${status.data.sessions.userActiveSessions} active`;
    }
  }

  private setup2FA() {
    console.log('Setup 2FA');
  }

  private viewSessions() {
    console.log('View Sessions');
  }

  private manageKeys() {
    console.log('Manage Keys');
  }

  private viewLogs() {
    console.log('View Logs');
  }
}
