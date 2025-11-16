import { initHome } from './ui/home';
import { initLogs } from './ui/logs';
import { initControls } from './ui/controls';

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initHome();
  initLogs();
  initControls();
  initStatusIndicator();
});

function initTabs(): void {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');

      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      button.classList.add('active');
      const targetContent = document.getElementById(tabName as string);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

function initStatusIndicator(): void {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  window.dashboardAPI.onBotStatusUpdate((status) => {
    if (!statusDot || !statusText) return;

    if (status.running) {
      statusDot.classList.remove('offline');
      statusText.textContent = 'Bot Online';
    } else {
      statusDot.classList.add('offline');
      statusText.textContent = 'Bot Offline';
    }
  });

  updateStatus();
  setInterval(updateStatus, 10000);
}

async function updateStatus(): Promise<void> {
  const result = await window.dashboardAPI.getBotStatus();

  if (result.success && result.data) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (!statusDot || !statusText) return;

    if (result.data.running) {
      statusDot.classList.remove('offline');
      statusText.textContent = 'Bot Online';
    } else {
      statusDot.classList.add('offline');
      statusText.textContent = 'Bot Offline';
    }
  }
}
