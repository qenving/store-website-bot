export function initHome(): void {
  updateStats();
  setInterval(updateStats, 5000);

  window.dashboardAPI.onBotStatusUpdate((status) => {
    renderStats(status);
  });

  window.dashboardAPI.onTransactionEvent((event) => {
    addRecentActivity(event);
  });
}

async function updateStats(): Promise<void> {
  const result = await window.dashboardAPI.getBotStatus();

  if (result.success && result.data) {
    renderStats(result.data);
  }
}

function renderStats(status: any): void {
  const statsGrid = document.getElementById('statsGrid');
  if (!statsGrid) return;

  const uptime = formatUptime(status.uptime);
  const ping = status.ping !== null ? `${status.ping}ms` : 'N/A';

  statsGrid.innerHTML = `
    <div class="stat-item">
      <div class="stat-label">Status</div>
      <div class="stat-value" style="color: ${status.running ? '#43b581' : '#f04747'}">
        ${status.running ? 'Online' : 'Offline'}
      </div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Uptime</div>
      <div class="stat-value">${uptime}</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Ping</div>
      <div class="stat-value">${ping}</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Pending Transactions</div>
      <div class="stat-value">${status.pendingTransactions}</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Connected Guilds</div>
      <div class="stat-value">${status.connectedGuilds}</div>
    </div>
  `;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function addRecentActivity(event: any): void {
  const recentLogs = document.getElementById('recentLogs');
  if (!recentLogs) return;

  const timestamp = new Date(event.timestamp).toLocaleTimeString();

  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';
  logEntry.innerHTML = `
    <span class="log-timestamp">${timestamp}</span>
    <span class="log-level info">${event.type}</span>
    <span class="log-message">Order ${event.transaction.orderId} - ${event.transaction.status}</span>
  `;

  if (recentLogs.firstChild?.textContent?.includes('No recent activity')) {
    recentLogs.innerHTML = '';
  }

  recentLogs.insertBefore(logEntry, recentLogs.firstChild);

  const entries = recentLogs.querySelectorAll('.log-entry');
  if (entries.length > 10) {
    entries[entries.length - 1].remove();
  }
}
