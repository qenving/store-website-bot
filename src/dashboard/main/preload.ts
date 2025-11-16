import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipcChannels';
import { IPCResponse, BotStatus, MaintenanceMode, DashboardConfig } from '../shared/types';

const API_EXPOS� = {
  getBotStatus: (): Promise<IPCResponse<BotStatus>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_BOT_STATUS);
  },

  startBot: (): Promise<IPCResponse<void>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.START_BOT);
  },

  stopBot: (): Promise<IPCResponse<void>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STOP_BOT);
  },

  restartBot: (): Promise<IPCResponse<void>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.RESTART_BOT);
  },

  toggleMaintenance: (): Promise<IPCResponse<MaintenanceMode>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_MAINTENANCE);
  },

  getConfig: (): Promise<IPCResponse<DashboardConfig>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
  },

  getPendingTransactions: (): Promise<IPCResponse<number>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_PENDING_TRANSACTIONS);
  },

  onBotStatusUpdate: (callback: (status: BotStatus) => void) => {
    ipcRenderer.on('bot-status-update', (_event, status) => callback(status));
  },

  onLog: (callback: (log: any) => void) => {
    ipcRenderer.on('log-event', (_event, log) => callback(log));
  },

  onTransactionEvent: (callback: (event: any) => void) => {
    ipcRenderer.on('transaction-event', (_event, event) => callback(event));
  }
};

const SECURITY_API = {
  getStatus: (): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke('security:getStatus');
  },

  getTOTPStatus: (userId: string): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke('security:getTOTPStatus', userId);
  },

  setupTOTP: (userId: string): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke('security:setupTOTP', userId);
  },

  getActiveSessions: (): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke('security:getActiveSessions');
  },

  revokeSession: (sessionId: string): Promise<IPCResponse<void>> => {
    return ipcRenderer.invoke('security:revokeSession', sessionId);
  },

  getRotationStatus: (): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke('security:getRotationStatus');
  },

  rotateKey: (keyType: string, data: any): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke('security:rotateKey', keyType, data);
  },

  getSecurityLogs: (filters: any): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke('security:getSecurityLogs', filters);
  },

  getMaskedSecrets: (): Promise<IPCResponse<any>> => {
    return ipcRenderer.invoke('security:getMaskedSecrets');
  }
};

contextBridge.exposeInMainWorld('dashboardAPI', API_EXPOS�);
contextBridge.exposeInMainWorld('securityAPI', SECURITY_API);

declare global {
  interface Window {
    dashboardAPI: typeof API_EXPOS�;
    securityAPI: typeof SECURITY_API;
  }
}
