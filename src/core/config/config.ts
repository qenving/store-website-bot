import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigError } from '../utils/errors';

dotenv.config();

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  type: string;
  metadata?: Record<string, any>;
}

export interface PaymentGatewayConfig {
  mock: {
    enabled: boolean;
    autoConfirmDelay: number;
  };
}

export interface AppConfig {
  name: string;
  version: string;
  supportUrl: string;
}

export interface ConfigFile {
  products: Product[];
  paymentGateway: PaymentGatewayConfig;
  app: AppConfig;
}

export interface DatabaseConfig {
  driver: 'json' | 'mysql' | 'mongodb';
  mysql?: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  mongodb?: {
    uri: string;
  };
}

export interface DiscordConfig {
  token: string;
  clientId: string;
  guildId?: string;
}

export interface WebsiteConfig {
  port: number;
  host: string;
}

export interface APIConfig {
  port: number;
  host: string;
  secret: string;
}

export interface SocketConfig {
  port: number;
  host: string;
}

export interface Config {
  database: DatabaseConfig;
  discord: DiscordConfig;
  website: WebsiteConfig;
  api: APIConfig;
  socket: SocketConfig;
  products: Product[];
  paymentGateway: PaymentGatewayConfig;
  app: AppConfig;
  env: string;
  logLevel: string;
}

class ConfigManager {
  private config: Config | null = null;

  load(): Config {
    if (this.config) {
      return this.config;
    }

    const dbDriver = (process.env.DB_DRIVER || 'json') as 'json' | 'mysql' | 'mongodb';

    const database: DatabaseConfig = {
      driver: dbDriver
    };

    if (dbDriver === 'mysql') {
      database.mysql = {
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'discord_store'
      };
    } else if (dbDriver === 'mongodb') {
      database.mongodb = {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/discord_store'
      };
    }

    const discordToken = process.env.DISCORD_TOKEN;
    const discordClientId = process.env.DISCORD_CLIENT_ID;

    if (!discordToken) {
      throw new ConfigError('DISCORD_TOKEN is required in environment variables');
    }

    if (!discordClientId) {
      throw new ConfigError('DISCORD_CLIENT_ID is required in environment variables');
    }

    const configFilePath = path.join(process.cwd(), 'config.json');
    const configFileExamplePath = path.join(process.cwd(), 'config.example.json');

    let configFile: ConfigFile;

    try {
      if (fs.existsSync(configFilePath)) {
        const fileContent = fs.readFileSync(configFilePath, 'utf-8');
        configFile = JSON.parse(fileContent);
      } else if (fs.existsSync(configFileExamplePath)) {
        const fileContent = fs.readFileSync(configFileExamplePath, 'utf-8');
        configFile = JSON.parse(fileContent);
      } else {
        throw new ConfigError('config.json or config.example.json not found');
      }
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      throw new ConfigError('Failed to parse config file', error);
    }

    this.config = {
      database,
      discord: {
        token: discordToken,
        clientId: discordClientId,
        guildId: process.env.DISCORD_GUILD_ID
      },
      website: {
        port: parseInt(process.env.WEBSITE_PORT || '3000', 10),
        host: process.env.WEBSITE_HOST || 'localhost'
      },
      api: {
        port: parseInt(process.env.API_PORT || '3001', 10),
        host: process.env.API_HOST || 'localhost',
        secret: process.env.API_SECRET || 'default_secret_change_me'
      },
      socket: {
        port: parseInt(process.env.SOCKET_PORT || '3002', 10),
        host: process.env.SOCKET_HOST || 'localhost'
      },
      products: configFile.products,
      paymentGateway: configFile.paymentGateway,
      app: configFile.app,
      env: process.env.NODE_ENV || 'development',
      logLevel: process.env.LOG_LEVEL || 'info'
    };

    return this.config;
  }

  get(): Config {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  getProduct(productId: string): Product | undefined {
    const config = this.get();
    return config.products.find(p => p.id === productId);
  }

  getAllProducts(): Product[] {
    const config = this.get();
    return config.products;
  }
}

export const configManager = new ConfigManager();
export const getConfig = () => configManager.get();
