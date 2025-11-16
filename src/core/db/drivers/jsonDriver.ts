import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Transaction, User, Balance, Setting, Admin } from '../../transactions/TransactionTypes';
import { DatabaseError, NotFoundError } from '../../utils/errors';
import { createLogger } from '../../logging/logger';

const logger = createLogger({ module: 'JSONDriver' });

interface JSONDatabase {
  users: User[];
  transactions: Transaction[];
  balances: Balance[];
  settings: Setting[];
  admins: Admin[];
}

export class JSONDriver {
  private storagePath: string;
  private lockFile: string;
  private db: JSONDatabase;

  constructor(storagePath: string = path.join(process.cwd(), 'storage', 'json')) {
    this.storagePath = storagePath;
    this.lockFile = path.join(storagePath, '.lock');

    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    this.db = {
      users: [],
      transactions: [],
      balances: [],
      settings: [],
      admins: []
    };

    this.initializeFiles();
  }

  private initializeFiles(): void {
    const files = ['users', 'transactions', 'balances', 'settings', 'admins'];

    for (const file of files) {
      const filePath = path.join(this.storagePath, `${file}.json`);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify([], null, 2));
        logger.info(`Initialized ${file}.json`);
      }
    }
  }

  private getFilePath(collection: keyof JSONDatabase): string {
    return path.join(this.storagePath, `${collection}.json`);
  }

  private async acquireLock(): Promise<void> {
    let attempts = 0;
    const maxAttempts = 50;

    while (attempts < maxAttempts) {
      try {
        fs.writeFileSync(this.lockFile, process.pid.toString(), { flag: 'wx' });
        return;
      } catch (error) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    throw new DatabaseError('Failed to acquire lock after maximum attempts');
  }

  private releaseLock(): void {
    try {
      if (fs.existsSync(this.lockFile)) {
        fs.unlinkSync(this.lockFile);
      }
    } catch (error) {
      logger.error('Failed to release lock', error);
    }
  }

  private readCollection<T>(collection: keyof JSONDatabase): T[] {
    const filePath = this.getFilePath(collection);
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);

      return parsed.map((item: any) => {
        if (item.createdAt) item.createdAt = new Date(item.createdAt);
        if (item.updatedAt) item.updatedAt = new Date(item.updatedAt);
        if (item.completedAt) item.completedAt = new Date(item.completedAt);
        return item;
      });
    } catch (error) {
      logger.error(`Failed to read ${collection}`, error);
      return [];
    }
  }

  private writeCollection<T>(collection: keyof JSONDatabase, data: T[]): void {
    const filePath = this.getFilePath(collection);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      throw new DatabaseError(`Failed to write ${collection}`, error);
    }
  }

  async connect(): Promise<void> {
    logger.info('JSON Driver connected');
  }

  async disconnect(): Promise<void> {
    this.releaseLock();
    logger.info('JSON Driver disconnected');
  }

  async findUserById(userId: string): Promise<User | null> {
    const users = this.readCollection<User>('users');
    return users.find(u => u.id === userId) || null;
  }

  async findUserByDiscordId(discordId: string): Promise<User | null> {
    const users = this.readCollection<User>('users');
    return users.find(u => u.discordId === discordId) || null;
  }

  async createUser(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    await this.acquireLock();
    try {
      const users = this.readCollection<User>('users');

      const user: User = {
        id: uuidv4(),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      users.push(user);
      this.writeCollection('users', users);

      logger.info('User created', { userId: user.id });
      return user;
    } finally {
      this.releaseLock();
    }
  }

  async updateUser(userId: string, data: Partial<User>): Promise<User> {
    await this.acquireLock();
    try {
      const users = this.readCollection<User>('users');
      const index = users.findIndex(u => u.id === userId);

      if (index === -1) {
        throw new NotFoundError('User', userId);
      }

      users[index] = {
        ...users[index],
        ...data,
        id: userId,
        updatedAt: new Date()
      };

      this.writeCollection('users', users);

      logger.info('User updated', { userId });
      return users[index];
    } finally {
      this.releaseLock();
    }
  }

  async findTransactionById(transactionId: string): Promise<Transaction | null> {
    const transactions = this.readCollection<Transaction>('transactions');
    return transactions.find(t => t.id === transactionId) || null;
  }

  async findTransactionByOrderId(orderId: string): Promise<Transaction | null> {
    const transactions = this.readCollection<Transaction>('transactions');
    return transactions.find(t => t.orderId === orderId) || null;
  }

  async findTransactionsByUserId(userId: string): Promise<Transaction[]> {
    const transactions = this.readCollection<Transaction>('transactions');
    return transactions.filter(t => t.userId === userId);
  }

  async createTransaction(data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transaction> {
    await this.acquireLock();
    try {
      const transactions = this.readCollection<Transaction>('transactions');

      const transaction: Transaction = {
        id: uuidv4(),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      transactions.push(transaction);
      this.writeCollection('transactions', transactions);

      logger.info('Transaction created', { transactionId: transaction.id, orderId: transaction.orderId });
      return transaction;
    } finally {
      this.releaseLock();
    }
  }

  async updateTransaction(transactionId: string, data: Partial<Transaction>): Promise<Transaction> {
    await this.acquireLock();
    try {
      const transactions = this.readCollection<Transaction>('transactions');
      const index = transactions.findIndex(t => t.id === transactionId);

      if (index === -1) {
        throw new NotFoundError('Transaction', transactionId);
      }

      transactions[index] = {
        ...transactions[index],
        ...data,
        id: transactionId,
        updatedAt: new Date()
      };

      this.writeCollection('transactions', transactions);

      logger.info('Transaction updated', { transactionId, status: data.status });
      return transactions[index];
    } finally {
      this.releaseLock();
    }
  }

  async findAllTransactions(limit?: number): Promise<Transaction[]> {
    const transactions = this.readCollection<Transaction>('transactions');
    transactions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return limit ? transactions.slice(0, limit) : transactions;
  }

  async findBalanceByUserId(userId: string): Promise<Balance | null> {
    const balances = this.readCollection<Balance>('balances');
    return balances.find(b => b.userId === userId) || null;
  }

  async upsertBalance(userId: string, amount: number, currency: string): Promise<Balance> {
    await this.acquireLock();
    try {
      const balances = this.readCollection<Balance>('balances');
      const index = balances.findIndex(b => b.userId === userId);

      const balance: Balance = {
        userId,
        amount,
        currency,
        updatedAt: new Date()
      };

      if (index === -1) {
        balances.push(balance);
      } else {
        balances[index] = balance;
      }

      this.writeCollection('balances', balances);

      logger.info('Balance updated', { userId, amount });
      return balance;
    } finally {
      this.releaseLock();
    }
  }

  async getSetting(key: string): Promise<Setting | null> {
    const settings = this.readCollection<Setting>('settings');
    return settings.find(s => s.key === key) || null;
  }

  async setSetting(key: string, value: any): Promise<Setting> {
    await this.acquireLock();
    try {
      const settings = this.readCollection<Setting>('settings');
      const index = settings.findIndex(s => s.key === key);

      const setting: Setting = {
        key,
        value,
        updatedAt: new Date()
      };

      if (index === -1) {
        settings.push(setting);
      } else {
        settings[index] = setting;
      }

      this.writeCollection('settings', settings);

      logger.info('Setting updated', { key });
      return setting;
    } finally {
      this.releaseLock();
    }
  }

  async findAdminByDiscordId(discordId: string): Promise<Admin | null> {
    const admins = this.readCollection<Admin>('admins');
    return admins.find(a => a.discordId === discordId) || null;
  }

  async createAdmin(data: Omit<Admin, 'id' | 'createdAt'>): Promise<Admin> {
    await this.acquireLock();
    try {
      const admins = this.readCollection<Admin>('admins');

      const admin: Admin = {
        id: uuidv4(),
        ...data,
        createdAt: new Date()
      };

      admins.push(admin);
      this.writeCollection('admins', admins);

      logger.info('Admin created', { adminId: admin.id });
      return admin;
    } finally {
      this.releaseLock();
    }
  }
}
