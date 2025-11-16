import { getConfig } from '../config/config';

export interface StoreConfig {
  name: string;
  description: string;
  maintenanceMode: boolean;
  primaryCurrency: string;
  secondaryCurrency: string;
  enableWebsiteOrders: boolean;
  logoUrl?: string;
  supportUrl?: string;
  termsUrl?: string;
  maxOrdersPerDay: number;
  orderCooldownMinutes: number;
}

class StoreConfigManager {
  private config: StoreConfig = {
    name: 'Discord Store',
    description: 'Premium products and services for our community',
    maintenanceMode: false,
    primaryCurrency: 'IDR',
    secondaryCurrency: 'USD',
    enableWebsiteOrders: true,
    maxOrdersPerDay: 10,
    orderCooldownMinutes: 5
  };

  getConfig(): StoreConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<StoreConfig>): StoreConfig {
    this.config = { ...this.config, ...updates };
    return this.getConfig();
  }

  isMaintenanceMode(): boolean {
    return this.config.maintenanceMode;
  }

  setMaintenanceMode(enabled: boolean): void {
    this.config.maintenanceMode = enabled;
  }

  canPlaceOrder(): boolean {
    return this.config.enableWebsiteOrders && !this.config.maintenanceMode;
  }
}

export const storeConfig = new StoreConfigManager();
