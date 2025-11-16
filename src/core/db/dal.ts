import { Transaction, User, Balance, Setting, Admin } from '../transactions/TransactionTypes';
import { JSONDriver } from './drivers/jsonDriver';
import { MySQLDriver, MySQLConfig } from './drivers/mysqlDriver';
import { MongoDriver, MongoConfig } from './drivers/mongoDriver';
import { getConfig } from '../config/config';
import { DatabaseError } from '../utils/errors';
import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'DAL' });

interface DatabaseDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  findUserById(userId: string): Promise<User | null>;
  findUserByDiscordId(discordId: string): Promise<User | null>;
  createUser(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  updateUser(userId: string, data: Partial<User>): Promise<User>;
  findTransactionById(transactionId: string): Promise<Transaction | null>;
  findTransactionByOrderId(orderId: string): Promise<Transaction | null>;
  findTransactionsByUserId(userId: string): Promise<Transaction[]>;
  createTransaction(data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transaction>;
  updateTransaction(transactionId: string, data: Partial<Transaction>): Promise<Transaction>;
  findAllTransactions(limit?: number): Promise<Transaction[]>;
  findBalanceByUserId(userId: string): Promise<Balance | null>;
  upsertBalance(userId: string, amount: number, currency: string): Promise<Balance>;
  getSetting(key: string): Promise<Setting | null>;
  setSetting(key: string, value: any): Promise<Setting>;
  findAdminByDiscordId(discordId: string): Promise<Admin | null>;
  createAdmin(data: Omit<Admin, 'id' | 'createdAt'>): Promise<Admin>;
}

class DatabaseAbstractionLayer {
  private driver: DatabaseDriver | null = null;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const config = getConfig();
    const dbConfig = config.database;

    logger.info(`Initializing DAL with driver: ${dbConfig.driver}`);

    switch (dbConfig.driver) {
      case 'json':
        this.driver = new JSONDriver();
        break;

      case 'mysql':
        if (!dbConfig.mysql) {
          throw new DatabaseError('MySQL configuration is required when using mysql driver');
        }
        this.driver = new MySQLDriver(dbConfig.mysql as MySQLConfig);
        break;

      case 'mongodb':
        if (!dbConfig.mongodb) {
          throw new DatabaseError('MongoDB configuration is required when using mongodb driver');
        }
        this.driver = new MongoDriver(dbConfig.mongodb as MongoConfig);
        break;

      default:
        throw new DatabaseError(`Unsupported database driver: ${dbConfig.driver}`);
    }

    await this.driver.connect();
    this.initialized = true;

    logger.info(`DAL initialized with driver: ${dbConfig.driver}`);
  }

  async shutdown(): Promise<void> {
    if (this.driver) {
      await this.driver.disconnect();
      this.initialized = false;
      logger.info('DAL shutdown');
    }
  }

  private ensureDriver(): DatabaseDriver {
    if (!this.driver) {
      throw new DatabaseError('DAL not initialized. Call initialize() first.');
    }
    return this.driver;
  }

  get users() {
    return {
      findById: async (userId: string): Promise<User | null> => {
        const driver = this.ensureDriver();
        return driver.findUserById(userId);
      },

      findByDiscordId: async (discordId: string): Promise<User | null> => {
        const driver = this.ensureDriver();
        return driver.findUserByDiscordId(discordId);
      },

      create: async (data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> => {
        const driver = this.ensureDriver();
        return driver.createUser(data);
      },

      update: async (userId: string, data: Partial<User>): Promise<User> => {
        const driver = this.ensureDriver();
        return driver.updateUser(userId, data);
      },

      getOrCreate: async (discordId: string, username: string): Promise<User> => {
        const driver = this.ensureDriver();
        let user = await driver.findUserByDiscordId(discordId);

        if (!user) {
          user = await driver.createUser({
            discordId,
            username,
            balance: 0
          });
          logger.info('New user created', { userId: user.id, discordId });
        }

        return user;
      }
    };
  }

  get transactions() {
    return {
      findById: async (transactionId: string): Promise<Transaction | null> => {
        const driver = this.ensureDriver();
        return driver.findTransactionById(transactionId);
      },

      findByOrderId: async (orderId: string): Promise<Transaction | null> => {
        const driver = this.ensureDriver();
        return driver.findTransactionByOrderId(orderId);
      },

      findByUserId: async (userId: string): Promise<Transaction[]> => {
        const driver = this.ensureDriver();
        return driver.findTransactionsByUserId(userId);
      },

      create: async (data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transaction> => {
        const driver = this.ensureDriver();
        return driver.createTransaction(data);
      },

      updateState: async (transactionId: string, data: Partial<Transaction>): Promise<Transaction> => {
        const driver = this.ensureDriver();
        return driver.updateTransaction(transactionId, data);
      },

      findAll: async (limit?: number): Promise<Transaction[]> => {
        const driver = this.ensureDriver();
        return driver.findAllTransactions(limit);
      }
    };
  }

  get balances() {
    return {
      findByUserId: async (userId: string): Promise<Balance | null> => {
        const driver = this.ensureDriver();
        return driver.findBalanceByUserId(userId);
      },

      upsert: async (userId: string, amount: number, currency: string = 'IDR'): Promise<Balance> => {
        const driver = this.ensureDriver();
        return driver.upsertBalance(userId, amount, currency);
      }
    };
  }

  get settings() {
    return {
      get: async (key: string): Promise<Setting | null> => {
        const driver = this.ensureDriver();
        return driver.getSetting(key);
      },

      set: async (key: string, value: any): Promise<Setting> => {
        const driver = this.ensureDriver();
        return driver.setSetting(key, value);
      }
    };
  }

  get admins() {
    return {
      findByDiscordId: async (discordId: string): Promise<Admin | null> => {
        const driver = this.ensureDriver();
        return driver.findAdminByDiscordId(discordId);
      },

      create: async (data: Omit<Admin, 'id' | 'createdAt'>): Promise<Admin> => {
        const driver = this.ensureDriver();
        return driver.createAdmin(data);
      }
    };
  }
}

export const dal = new DatabaseAbstractionLayer();
