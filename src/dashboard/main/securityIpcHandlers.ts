import { ipcMain } from 'electron';
import { IPCResponse } from '../shared/types';
import { getSecretManager } from '../../core/security/secretManager';
import { getKeyRotationService } from '../../core/security/keyRotation';
import { getTOTPService } from '../../core/security/totpService';
import { getSessionManager } from '../../core/security/sessionManager';

const API_PORT = parseInt(process.env.API_PORT || '3001', 10);
const API_HOST = process.env.API_HOST || 'localhost';

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

export function registerSecurityIpcHandlers(): void {
  ipcMain.handle('security:getStatus', async (): Promise<IPCResponse<any>> => {
    try {
      const result = await fetchAPI('/api/security/status');
      return { success: true, data: result.data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get security status'
      };
    }
  });

  ipcMain.handle('security:getTOTPStatus', async (_event, userId: string): Promise<IPCResponse<any>> => {
    try {
      const totpService = getTOTPService();
      const enabled = await totpService.isTOTPEnabled(userId);
      return { success: true, data: { enabled } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get TOTP status'
      };
    }
  });

  ipcMain.handle('security:setupTOTP', async (_event, userId: string): Promise<IPCResponse<any>> => {
    try {
      const totpService = getTOTPService();
      const setupData = totpService.generateSecret(userId);
      return { success: true, data: setupData };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to setup TOTP'
      };
    }
  });

  ipcMain.handle('security:getActiveSessions', async (): Promise<IPCResponse<any>> => {
    try {
      const result = await fetchAPI('/api/security/sessions/active');
      return { success: true, data: result.data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get active sessions'
      };
    }
  });

  ipcMain.handle('security:revokeSession', async (_event, sessionId: string): Promise<IPCResponse<void>> => {
    try {
      await fetchAPI(`/api/security/sessions/${sessionId}`, { method: 'DELETE' });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to revoke session'
      };
    }
  });

  ipcMain.handle('security:getRotationStatus', async (): Promise<IPCResponse<any>> => {
    try {
      const result = await fetchAPI('/api/security/rotate/status');
      return { success: true, data: result.data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get rotation status'
      };
    }
  });

  ipcMain.handle('security:rotateKey', async (_event, keyType: string, data: any): Promise<IPCResponse<any>> => {
    try {
      const result = await fetchAPI(`/api/security/rotate/${keyType}`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
      return { success: true, data: result.data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to rotate key'
      };
    }
  });

  ipcMain.handle('security:getSecurityLogs', async (_event, filters: any): Promise<IPCResponse<any>> => {
    try {
      const params = new URLSearchParams(filters);
      const result = await fetchAPI(`/api/security/status/logs?${params}`);
      return { success: true, data: result.data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get security logs'
      };
    }
  });

  ipcMain.handle('security:getMaskedSecrets', async (): Promise<IPCResponse<any>> => {
    try {
      const secretManager = getSecretManager();
      const keys = secretManager.getSecretKeys();
      const masked = keys.map(key => ({
        key,
        value: secretManager.getMaskedSecret(key),
        metadata: secretManager.getMetadata(key)
      }));
      return { success: true, data: masked };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get secrets'
      };
    }
  });
}
