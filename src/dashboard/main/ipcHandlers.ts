import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/ipcChannels';
import { IPCResponse, BotStatus, MaintenanceMode, DashboardConfig } from '../shared/types';
import { registerMonitoringIpcHandlers } from './monitoringIpcHandlers';

const API_PORT = parseInt(process.env.API_PORT || '3001', 10);
const API_HOST = process.env.API_HOST || 'localhost';
const SOCKET_PORT = parseInt(process.env.SOCKET_PORT || '3002', 10);

async function fetchAPI<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `http://${API_HOST}:${API_PORT}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  return response.json();
}

export function registerIPCHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_BOT_STATUS, async (): Promise<IPCResponse<BotStatus>> => {
    try {
      const result = await fetchAPI<{ success: boolean; data: BotStatus }>('/internal/admin/status');

      return {
        success: true,
        data: result.data
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get bot status'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_PENDING_TRANSACTIONS, async (): Promise<IPCResponse<number>> => {
    try {
      const result = await fetchAPI<{ success: boolean; data: { count: number } }>('/internal/admin/pending-transactions');

      return {
        success: true,
        data: result.data.count
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get pending transactions'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TOGGLE_MAINTENANCE, async (): Promise<IPCResponse<MaintenanceMode>> => {
    try {
      const result = await fetchAPI<{ success: boolean; data: MaintenanceMode }>('/internal/admin/maintenance/toggle', {
        method: 'POST'
      });

      return {
        success: true,
        data: result.data
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to toggle maintenance mode'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.STOP_BOT, async (): Promise<IPCResponse<void>> => {
    try {
      await fetchAPI('/internal/admin/shutdown', {
        method: 'POST'
      });

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop bot'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.RESTART_BOT, async (): Promise<IPCResponse<void>> => {
    try {
      await fetchAPI('/internal/admin/shutdown', {
        method: 'POST'
      });

      setTimeout(() => {
        process.exit(1);
      }, 1000);

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to restart bot'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_CONFIG, async (): Promise<IPCResponse<DashboardConfig>> => {
    try {
      return {
        success: true,
        data: {
          socketPort: SOCKET_PORT,
          apiPort: API_PORT,
          apiHost: API_HOST
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get config'
      };
    }
  });

  // Register monitoring IPC handlers
  registerMonitoringIpcHandlers();
}
