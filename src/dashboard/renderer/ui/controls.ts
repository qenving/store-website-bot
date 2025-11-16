export function initControls(): void {
  const stopBtn = document.getElementById('stopBtn');
  const restartBtn = document.getElementById('restartBtn');
  const maintenanceBtn = document.getElementById('maintenanceBtn');

  if (stopBtn) {
    stopBtn.addEventListener('click', handleStopBot);
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', handleRestartBot);
  }

  if (maintenanceBtn) {
    maintenanceBtn.addEventListener('click', handleToggleMaintenance);
  }
}

async function handleStopBot(): Promise<void> {
  const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
  if (!stopBtn) return;

  if (!confirm('Are you sure you want to stop the bot?')) {
    return;
  }

  stopBtn.disabled = true;
  stopBtn.textContent = 'Stopping...';

  const result = await window.dashboardAPI.stopBot();

  if (result.success) {
    alert('Bot stopped successfully');
  } else {
    alert(`Failed to stop bot: ${result.error}`);
    stopBtn.disabled = false;
    stopBtn.textContent = '=Ñ Stop Bot';
  }
}

async function handleRestartBot(): Promise<void> {
  const restartBtn = document.getElementById('restartBtn') as HTMLButtonElement;
  if (!restartBtn) return;

  if (!confirm('Are you sure you want to restart the bot?')) {
    return;
  }

  restartBtn.disabled = true;
  restartBtn.textContent = 'Restarting...';

  const result = await window.dashboardAPI.restartBot();

  if (result.success) {
    alert('Bot restart initiated');
  } else {
    alert(`Failed to restart bot: ${result.error}`);
    restartBtn.disabled = false;
    restartBtn.textContent = '= Restart Bot';
  }
}

async function handleToggleMaintenance(): Promise<void> {
  const maintenanceBtn = document.getElementById('maintenanceBtn') as HTMLButtonElement;
  const maintenanceStatus = document.getElementById('maintenanceStatus');
  if (!maintenanceBtn || !maintenanceStatus) return;

  maintenanceBtn.disabled = true;
  maintenanceBtn.textContent = 'Toggling...';

  const result = await window.dashboardAPI.toggleMaintenance();

  if (result.success && result.data) {
    maintenanceStatus.textContent = `Status: ${result.data.enabled ? 'Enabled' : 'Disabled'}`;
    maintenanceStatus.style.color = result.data.enabled ? '#faa61a' : '#43b581';

    if (result.data.message) {
      maintenanceStatus.textContent += ` - ${result.data.message}`;
    }
  } else {
    alert(`Failed to toggle maintenance mode: ${result.error}`);
  }

  maintenanceBtn.disabled = false;
  maintenanceBtn.textContent = '=' Toggle Maintenance';
}
