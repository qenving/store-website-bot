import { MongoClient, Db, Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { Transaction, User, Balance, Setting, Admin } from '../../transactions/TransactionTypes';
import { DatabaseError, NotFoundError } from '../../utils/errors';
import { createLogger } from '../../logging/logger';

const logger = createLogger({ module: 'MongoDriver' });

export interface MongoConfig {
  uri: string;
}

export class MongoDriver {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private config: MongoConfig;

  constructor(config: MongoConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      this.client = new MongoClient(this.config.uri);
      await this.client.connect();

      const dbName = new URL(this.config.uri).pathname.slice(1) || 'discord_store';
      this.db = this.client.db(dbName);

      logger.info('MongoDB Driver connected', { database: dbName });

      await this.initializeCollections();
    } catch (error) {
      throw new DatabaseError('Failed to connect to MongoDB', error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      logger.info('MongoDB Driver disconnected');
    }
  }

  private async initializeCollections(): Promise<void> {
    if (!this.db) {
      throw new DatabaseError('Database not connected');
    }

    try {
      await this.db.collection('users').createIndex({ discordId: 1 }, { unique: true });
      await this.db.collection('transactions').createIndex({ orderId: 1 }, { unique: true });
      await this.db.collection('transactions').createIndex({ userId: 1 });
      await this.db.collection('transactions').createIndex({ status: 1 });
      await this.db.collection('balances').createIndex({ userId: 1 }, { unique: true });
      await this.db.collection('settings').createIndex({ key: 1 }, { unique: true });
      await this.db.collection('admins').createIndex({ discordId: 1 }, { unique: true });

      logger.info('MongoDB collections and indexes initialized');
    } catch (error) {
      logger.warn('Failed to create some indexes (they may already exist)', error);
    }
  }

  private ensureDb(): Db {
    if (!this.db) {
      throw new DatabaseError('Database not connected');
    }
    return this.db;
  }

  private getUsersCollection(): Collection<any> {
    return this.ensureDb().collection('users');
  }

  private getTransactionsCollection(): Collection<any> {
    return this.ensureDb().collection('transactions');
  }

  private getBalancesCollection(): Collection<any> {
    return this.ensureDb().collection('balances');
  }

  private getSettingsCollection(): Collection<any> {
    return this.ensureDb().collection('settings');
  }

  private getAdminsCollection(): Collection<any> {
    return this.ensureDb().collection('admins');
  }

  async findUserById(userId: string): Promise<User | null> {
    try {
      const collection = this.getUsersCollection();
      const doc = await collection.findOne({ id: userId });

      if (!doc) return null;

      return this.docToUser(doc);
    } catch (error) {
      throw new DatabaseError('Failed to find user by id', error);
    }
  }

  async findUserByDiscordId(discordId: string): Promise<User | null> {
    try {
      const collection = this.getUsersCollection();
      const doc = await collection.findOne({ discordId });

      if (!doc) return null;

      return this.docToUser(doc);
    } catch (error) {
      throw new DatabaseError('Failed to find user by discord id', error);
    }
  }

  async createUser(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const id = uuidv4();
    const now = new Date();

    const user: User = {
      id,
      ...data,
      createdAt: now,
      updatedAt: now
    };

    try {
      const collection = this.getUsersCollection();
      await collection.insertOne(user);

      logger.info('User created', { userId: id });

      return user;
    } catch (error) {
      throw new DatabaseError('Failed to create user', error);
    }
  }

  async updateUser(userId: string, data: Partial<User>): Promise<User> {
    const now = new Date();

    try {
      const collection = this.getUsersCollection();
      const result = await collection.findOneAndUpdate(
        { id: userId },
        { $set: { ...data, updatedAt: now } },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new NotFoundError('User', userId);
      }

      logger.info('User updated', { userId });

      return this.docToUser(result);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Failed to update user', error);
    }
  }

  async findTransactionById(transactionId: string): Promise<Transaction | null> {
    try {
      const collection = this.getTransactionsCollection();
      const doc = await collection.findOne({ id: transactionId });

      if (!doc) return null;

      return this.docToTransaction(doc);
    } catch (error) {
      throw new DatabaseError('Failed to find transaction by id', error);
    }
  }

  async findTransactionByOrderId(orderId: string): Promise<Transaction | null> {
    try {
      const collection = this.getTransactionsCollection();
      const doc = await collection.findOne({ orderId });

      if (!doc) return null;

      return this.docToTransaction(doc);
    } catch (error) {
      throw new DatabaseError('Failed to find transaction by order id', error);
    }
  }

  async findTransactionsByUserId(userId: string): Promise<Transaction[]> {
    try {
      const collection = this.getTransactionsCollection();
      const docs = await collection
        .find({ userId })
        .sort({ createdAt: -1 })
        .toArray();

      return docs.map(doc => this.docToTransaction(doc));
    } catch (error) {
      throw new DatabaseError('Failed to find transactions by user id', error);
    }
  }

  async createTransaction(data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transaction> {
    const id = uuidv4();
    const now = new Date();

    const transaction: Transaction = {
      id,
      ...data,
      createdAt: now,
      updatedAt: now
    };

    try {
      const collection = this.getTransactionsCollection();
      await collection.insertOne(transaction);

      logger.info('Transaction created', { transactionId: id, orderId: transaction.orderId });

      return transaction;
    } catch (error) {
      throw new DatabaseError('Failed to create transaction', error);
    }
  }

  async updateTransaction(transactionId: string, data: Partial<Transaction>): Promise<Transaction> {
    const now = new Date();

    try {
      const collection = this.getTransactionsCollection();
      const result = await collection.findOneAndUpdate(
        { id: transactionId },
        { $set: { ...data, updatedAt: now } },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new NotFoundError('Transaction', transactionId);
      }

      logger.info('Transaction updated', { transactionId, status: data.status });

      return this.docToTransaction(result);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Failed to update transaction', error);
    }
  }

  async findAllTransactions(limit?: number): Promise<Transaction[]> {
    try {
      const collection = this.getTransactionsCollection();
      let query = collection.find().sort({ createdAt: -1 });

      if (limit) {
        query = query.limit(limit);
      }

      const docs = await query.toArray();

      return docs.map(doc => this.docToTransaction(doc));
    } catch (error) {
      throw new DatabaseError('Failed to find all transactions', error);
    }
  }

  async findBalanceByUserId(userId: string): Promise<Balance | null> {
    try {
      const collection = this.getBalancesCollection();
      const doc = await collection.findOne({ userId });

      if (!doc) return null;

      return this.docToBalance(doc);
    } catch (error) {
      throw new DatabaseError('Failed to find balance', error);
    }
  }

  async upsertBalance(userId: string, amount: number, currency: string): Promise<Balance> {
    const now = new Date();

    const balance: Balance = {
      userId,
      amount,
      currency,
      updatedAt: now
    };

    try {
      const collection = this.getBalancesCollection();
      await collection.updateOne(
        { userId },
        { $set: balance },
        { upsert: true }
      );

      logger.info('Balance updated', { userId, amount });

      return balance;
    } catch (error) {
      throw new DatabaseError('Failed to upsert balance', error);
    }
  }

  async getSetting(key: string): Promise<Setting | null> {
    try {
      const collection = this.getSettingsCollection();
      const doc = await collection.findOne({ key });

      if (!doc) return null;

      return this.docToSetting(doc);
    } catch (error) {
      throw new DatabaseError('Failed to get setting', error);
    }
  }

  async setSetting(key: string, value: any): Promise<Setting> {
    const now = new Date();

    const setting: Setting = {
      key,
      value,
      updatedAt: now
    };

    try {
      const collection = this.getSettingsCollection();
      await collection.updateOne(
        { key },
        { $set: setting },
        { upsert: true }
      );

      logger.info('Setting updated', { key });

      return setting;
    } catch (error) {
      throw new DatabaseError('Failed to set setting', error);
    }
  }

  async findAdminByDiscordId(discordId: string): Promise<Admin | null> {
    try {
      const collection = this.getAdminsCollection();
      const doc = await collection.findOne({ discordId });

      if (!doc) return null;

      return this.docToAdmin(doc);
    } catch (error) {
      throw new DatabaseError('Failed to find admin', error);
    }
  }

  async createAdmin(data: Omit<Admin, 'id' | 'createdAt'>): Promise<Admin> {
    const id = uuidv4();
    const now = new Date();

    const admin: Admin = {
      id,
      ...data,
      createdAt: now
    };

    try {
      const collection = this.getAdminsCollection();
      await collection.insertOne(admin);

      logger.info('Admin created', { adminId: id });

      return admin;
    } catch (error) {
      throw new DatabaseError('Failed to create admin', error);
    }
  }

  private docToUser(doc: any): User {
    return {
      id: doc.id,
      discordId: doc.discordId,
      username: doc.username,
      email: doc.email,
      balance: doc.balance,
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt)
    };
  }

  private docToTransaction(doc: any): Transaction {
    return {
      id: doc.id,
      orderId: doc.orderId,
      userId: doc.userId,
      productId: doc.productId,
      amount: doc.amount,
      currency: doc.currency,
      status: doc.status,
      paymentMethod: doc.paymentMethod,
      paymentLink: doc.paymentLink,
      metadata: doc.metadata,
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
      completedAt: doc.completedAt ? new Date(doc.completedAt) : undefined
    };
  }

  private docToBalance(doc: any): Balance {
    return {
      userId: doc.userId,
      amount: doc.amount,
      currency: doc.currency,
      updatedAt: new Date(doc.updatedAt)
    };
  }

  private docToSetting(doc: any): Setting {
    return {
      key: doc.key,
      value: doc.value,
      updatedAt: new Date(doc.updatedAt)
    };
  }

  private docToAdmin(doc: any): Admin {
    return {
      id: doc.id,
      discordId: doc.discordId,
      username: doc.username,
      permissions: doc.permissions,
      createdAt: new Date(doc.createdAt)
    };
  }
}
