const MAX_LOGS = 100;

export function initLogs(): void {
  window.dashboardAPI.onLog((log) => {
    addLogEntry(log);
  });

  window.dashboardAPI.onTransactionEvent((event) => {
    addTransactionLog(event);
  });
}

function addLogEntry(log: any): void {
  const logsContainer = document.getElementById('logsContainer');
  if (!logsContainer) return;

  const timestamp = new Date(log.timestamp).toLocaleTimeString();

  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';
  logEntry.innerHTML = `
    <span class="log-timestamp">${timestamp}</span>
    <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
    <span class="log-message">${escapeHTML(log.message)}</span>
  `;

  if (logsContainer.firstChild?.textContent?.includes('Waiting for logs')) {
    logsContainer.innerHTML = '';
  }

  logsContainer.insertBefore(logEntry, logsContainer.firstChild);

  const entries = logsContainer.querySelectorAll('.log-entry');
  if (entries.length > MAX_LOGS) {
    entries[entries.length - 1].remove();
  }

  logsContainer.scrollTop = 0;
}

function addTransactionLog(event: any): void {
  const logsContainer = document.getElementById('logsContainer');
  if (!logsContainer) return;

  const timestamp = new Date(event.timestamp).toLocaleTimeString();
  const transaction = event.transaction;

  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';
  logEntry.innerHTML = `
    <span class="log-timestamp">${timestamp}</span>
    <span class="log-level info">TRANSACTION</span>
    <span class="log-message">${event.type} - Order: ${transaction.orderId} | Product: ${transaction.productId} | Status: ${transaction.status}</span>
  `;

  if (logsContainer.firstChild?.textContent?.includes('Waiting for logs')) {
    logsContainer.innerHTML = '';
  }

  logsContainer.insertBefore(logEntry, logsContainer.firstChild);

  const entries = logsContainer.querySelectorAll('.log-entry');
  if (entries.length > MAX_LOGS) {
    entries[entries.length - 1].remove();
  }

  logsContainer.scrollTop = 0;
}

function escapeHTML(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
