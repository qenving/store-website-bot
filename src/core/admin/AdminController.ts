import { Client } from 'discord.js';
import { createLogger } from '../logging/logger';
import { dal } from '../db/dal';
import { realtimeServer } from '../../realtime/socketServer';

const logger = createLogger({ module: 'AdminController' });

export interface BotStatusData {
  running: boolean;
  uptime: number;
  ping: number | null;
  pendingTransactions: number;
  connectedGuilds: number;
  lastUpdate: Date;
}

export interface MaintenanceModeData {
  enabled: boolean;
  message?: string;
}

class AdminControllerClass {
  private botClient: Client | null = null;
  private botStartTime: Date | null = null;
  private maintenanceMode: MaintenanceModeData = { enabled: false };

  registerBotClient(client: Client): void {
    this.botClient = client;
    this.botStartTime = new Date();
    logger.info('Bot client registered with AdminController');

    setInterval(() => {
      this.emitBotStatus();
    }, 5000);
  }

  async getBotStatus(): Promise<BotStatusData> {
    const running = this.botClient !== null && this.botClient.isReady();
    const uptime = this.botStartTime ? Date.now() - this.botStartTime.getTime() : 0;
    const ping = this.botClient?.ws.ping ?? null;

    const transactions = await dal.transactions.findAll();
    const pendingTransactions = transactions.filter(
      t => t.status === 'pending' || t.status === 'processing'
    ).length;

    const connectedGuilds = this.botClient?.guilds.cache.size ?? 0;

    return {
      running,
      uptime,
      ping,
      pendingTransactions,
      connectedGuilds,
      lastUpdate: new Date()
    };
  }

  private async emitBotStatus(): Promise<void> {
    try {
      const status = await this.getBotStatus();
      realtimeServer.getIO()?.emit('bot_status', status);
    } catch (error) {
      logger.error('Failed to emit bot status', error);
    }
  }

  async getPendingTransactions(): Promise<number> {
    const transactions = await dal.transactions.findAll();
    return transactions.filter(
      t => t.status === 'pending' || t.status === 'processing'
    ).length;
  }

  getMaintenanceMode(): MaintenanceModeData {
    return this.maintenanceMode;
  }

  setMaintenanceMode(enabled: boolean, message?: string): MaintenanceModeData {
    this.maintenanceMode = { enabled, message };
    logger.info(`Maintenance mode ${enabled ? 'enabled' : 'disabled'}`, {
      message
    });

    realtimeServer.getIO()?.emit('maintenance_mode', this.maintenanceMode);

    return this.maintenanceMode;
  }

  toggleMaintenanceMode(): MaintenanceModeData {
    return this.setMaintenanceMode(!this.maintenanceMode.enabled);
  }

  async shutdownBot(): Promise<void> {
    if (!this.botClient) {
      throw new Error('Bot client not registered');
    }

    logger.info('Shutting down bot...');
    this.botClient.destroy();
    this.botClient = null;
    this.botStartTime = null;

    logger.info('Bot shut down successfully');
  }

  isBotRunning(): boolean {
    return this.botClient !== null && this.botClient.isReady();
  }
}

export const adminController = new AdminControllerClass();
