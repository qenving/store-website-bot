import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { Transaction, User, Balance, Setting, Admin } from '../../transactions/TransactionTypes';
import { DatabaseError, NotFoundError } from '../../utils/errors';
import { createLogger } from '../../logging/logger';

const logger = createLogger({ module: 'MySQLDriver' });

export interface MySQLConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export class MySQLDriver {
  private pool: mysql.Pool | null = null;
  private config: MySQLConfig;

  constructor(config: MySQLConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      this.pool = mysql.createPool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });

      await this.pool.getConnection();
      logger.info('MySQL Driver connected');

      await this.initializeTables();
    } catch (error) {
      throw new DatabaseError('Failed to connect to MySQL', error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      logger.info('MySQL Driver disconnected');
    }
  }

  private async initializeTables(): Promise<void> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        discordId VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        balance DECIMAL(15, 2) DEFAULT 0,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        INDEX idx_discordId (discordId)
      )
    `;

    const createTransactionsTable = `
      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(36) PRIMARY KEY,
        orderId VARCHAR(255) UNIQUE NOT NULL,
        userId VARCHAR(36) NOT NULL,
        productId VARCHAR(255) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'IDR',
        status VARCHAR(50) NOT NULL,
        paymentMethod VARCHAR(255),
        paymentLink TEXT,
        metadata JSON,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        completedAt DATETIME,
        INDEX idx_orderId (orderId),
        INDEX idx_userId (userId),
        INDEX idx_status (status),
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `;

    const createBalancesTable = `
      CREATE TABLE IF NOT EXISTS balances (
        userId VARCHAR(36) PRIMARY KEY,
        amount DECIMAL(15, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'IDR',
        updatedAt DATETIME NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `;

    const createSettingsTable = `
      CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(255) PRIMARY KEY,
        value JSON NOT NULL,
        updatedAt DATETIME NOT NULL
      )
    `;

    const createAdminsTable = `
      CREATE TABLE IF NOT EXISTS admins (
        id VARCHAR(36) PRIMARY KEY,
        discordId VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(255) NOT NULL,
        permissions JSON NOT NULL,
        createdAt DATETIME NOT NULL,
        INDEX idx_discordId (discordId)
      )
    `;

    try {
      await this.pool.execute(createUsersTable);
      await this.pool.execute(createTransactionsTable);
      await this.pool.execute(createBalancesTable);
      await this.pool.execute(createSettingsTable);
      await this.pool.execute(createAdminsTable);
      logger.info('MySQL tables initialized');
    } catch (error) {
      throw new DatabaseError('Failed to initialize tables', error);
    }
  }

  private ensurePool(): mysql.Pool {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }
    return this.pool;
  }

  async findUserById(userId: string): Promise<User | null> {
    const pool = this.ensurePool();
    try {
      const [rows] = await pool.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM users WHERE id = ?',
        [userId]
      );

      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        id: row.id,
        discordId: row.discordId,
        username: row.username,
        email: row.email,
        balance: parseFloat(row.balance),
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
      };
    } catch (error) {
      throw new DatabaseError('Failed to find user by id', error);
    }
  }

  async findUserByDiscordId(discordId: string): Promise<User | null> {
    const pool = this.ensurePool();
    try {
      const [rows] = await pool.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM users WHERE discordId = ?',
        [discordId]
      );

      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        id: row.id,
        discordId: row.discordId,
        username: row.username,
        email: row.email,
        balance: parseFloat(row.balance),
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
      };
    } catch (error) {
      throw new DatabaseError('Failed to find user by discord id', error);
    }
  }

  async createUser(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const pool = this.ensurePool();
    const id = uuidv4();
    const now = new Date();

    try {
      await pool.execute(
        'INSERT INTO users (id, discordId, username, email, balance, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, data.discordId, data.username, data.email || null, data.balance, now, now]
      );

      logger.info('User created', { userId: id });

      return {
        id,
        ...data,
        email: data.email,
        createdAt: now,
        updatedAt: now
      };
    } catch (error) {
      throw new DatabaseError('Failed to create user', error);
    }
  }

  async updateUser(userId: string, data: Partial<User>): Promise<User> {
    const pool = this.ensurePool();
    const now = new Date();

    const fields: string[] = [];
    const values: any[] = [];

    if (data.username !== undefined) {
      fields.push('username = ?');
      values.push(data.username);
    }
    if (data.email !== undefined) {
      fields.push('email = ?');
      values.push(data.email);
    }
    if (data.balance !== undefined) {
      fields.push('balance = ?');
      values.push(data.balance);
    }

    fields.push('updatedAt = ?');
    values.push(now);
    values.push(userId);

    try {
      await pool.execute(
        `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      logger.info('User updated', { userId });

      const user = await this.findUserById(userId);
      if (!user) {
        throw new NotFoundError('User', userId);
      }
      return user;
    } catch (error) {
      throw new DatabaseError('Failed to update user', error);
    }
  }

  async findTransactionById(transactionId: string): Promise<Transaction | null> {
    const pool = this.ensurePool();
    try {
      const [rows] = await pool.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM transactions WHERE id = ?',
        [transactionId]
      );

      if (rows.length === 0) return null;

      const row = rows[0];
      return this.rowToTransaction(row);
    } catch (error) {
      throw new DatabaseError('Failed to find transaction by id', error);
    }
  }

  async findTransactionByOrderId(orderId: string): Promise<Transaction | null> {
    const pool = this.ensurePool();
    try {
      const [rows] = await pool.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM transactions WHERE orderId = ?',
        [orderId]
      );

      if (rows.length === 0) return null;

      const row = rows[0];
      return this.rowToTransaction(row);
    } catch (error) {
      throw new DatabaseError('Failed to find transaction by order id', error);
    }
  }

  async findTransactionsByUserId(userId: string): Promise<Transaction[]> {
    const pool = this.ensurePool();
    try {
      const [rows] = await pool.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM transactions WHERE userId = ? ORDER BY createdAt DESC',
        [userId]
      );

      return rows.map(row => this.rowToTransaction(row));
    } catch (error) {
      throw new DatabaseError('Failed to find transactions by user id', error);
    }
  }

  async createTransaction(data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transaction> {
    const pool = this.ensurePool();
    const id = uuidv4();
    const now = new Date();

    try {
      await pool.execute(
        `INSERT INTO transactions
        (id, orderId, userId, productId, amount, currency, status, paymentMethod, paymentLink, metadata, createdAt, updatedAt, completedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.orderId,
          data.userId,
          data.productId,
          data.amount,
          data.currency,
          data.status,
          data.paymentMethod || null,
          data.paymentLink || null,
          data.metadata ? JSON.stringify(data.metadata) : null,
          now,
          now,
          data.completedAt || null
        ]
      );

      logger.info('Transaction created', { transactionId: id, orderId: data.orderId });

      return {
        id,
        ...data,
        createdAt: now,
        updatedAt: now
      };
    } catch (error) {
      throw new DatabaseError('Failed to create transaction', error);
    }
  }

  async updateTransaction(transactionId: string, data: Partial<Transaction>): Promise<Transaction> {
    const pool = this.ensurePool();
    const now = new Date();

    const fields: string[] = [];
    const values: any[] = [];

    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.paymentMethod !== undefined) {
      fields.push('paymentMethod = ?');
      values.push(data.paymentMethod);
    }
    if (data.paymentLink !== undefined) {
      fields.push('paymentLink = ?');
      values.push(data.paymentLink);
    }
    if (data.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(JSON.stringify(data.metadata));
    }
    if (data.completedAt !== undefined) {
      fields.push('completedAt = ?');
      values.push(data.completedAt);
    }

    fields.push('updatedAt = ?');
    values.push(now);
    values.push(transactionId);

    try {
      await pool.execute(
        `UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      logger.info('Transaction updated', { transactionId, status: data.status });

      const transaction = await this.findTransactionById(transactionId);
      if (!transaction) {
        throw new NotFoundError('Transaction', transactionId);
      }
      return transaction;
    } catch (error) {
      throw new DatabaseError('Failed to update transaction', error);
    }
  }

  async findAllTransactions(limit?: number): Promise<Transaction[]> {
    const pool = this.ensurePool();
    try {
      const query = limit
        ? 'SELECT * FROM transactions ORDER BY createdAt DESC LIMIT ?'
        : 'SELECT * FROM transactions ORDER BY createdAt DESC';

      const params = limit ? [limit] : [];

      const [rows] = await pool.execute<mysql.RowDataPacket[]>(query, params);

      return rows.map(row => this.rowToTransaction(row));
    } catch (error) {
      throw new DatabaseError('Failed to find all transactions', error);
    }
  }

  async findBalanceByUserId(userId: string): Promise<Balance | null> {
    const pool = this.ensurePool();
    try {
      const [rows] = await pool.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM balances WHERE userId = ?',
        [userId]
      );

      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        userId: row.userId,
        amount: parseFloat(row.amount),
        currency: row.currency,
        updatedAt: new Date(row.updatedAt)
      };
    } catch (error) {
      throw new DatabaseError('Failed to find balance', error);
    }
  }

  async upsertBalance(userId: string, amount: number, currency: string): Promise<Balance> {
    const pool = this.ensurePool();
    const now = new Date();

    try {
      await pool.execute(
        `INSERT INTO balances (userId, amount, currency, updatedAt)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE amount = ?, currency = ?, updatedAt = ?`,
        [userId, amount, currency, now, amount, currency, now]
      );

      logger.info('Balance updated', { userId, amount });

      return {
        userId,
        amount,
        currency,
        updatedAt: now
      };
    } catch (error) {
      throw new DatabaseError('Failed to upsert balance', error);
    }
  }

  async getSetting(key: string): Promise<Setting | null> {
    const pool = this.ensurePool();
    try {
      const [rows] = await pool.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM settings WHERE `key` = ?',
        [key]
      );

      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        key: row.key,
        value: JSON.parse(row.value),
        updatedAt: new Date(row.updatedAt)
      };
    } catch (error) {
      throw new DatabaseError('Failed to get setting', error);
    }
  }

  async setSetting(key: string, value: any): Promise<Setting> {
    const pool = this.ensurePool();
    const now = new Date();

    try {
      await pool.execute(
        'INSERT INTO settings (`key`, value, updatedAt) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = ?, updatedAt = ?',
        [key, JSON.stringify(value), now, JSON.stringify(value), now]
      );

      logger.info('Setting updated', { key });

      return {
        key,
        value,
        updatedAt: now
      };
    } catch (error) {
      throw new DatabaseError('Failed to set setting', error);
    }
  }

  async findAdminByDiscordId(discordId: string): Promise<Admin | null> {
    const pool = this.ensurePool();
    try {
      const [rows] = await pool.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM admins WHERE discordId = ?',
        [discordId]
      );

      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        id: row.id,
        discordId: row.discordId,
        username: row.username,
        permissions: JSON.parse(row.permissions),
        createdAt: new Date(row.createdAt)
      };
    } catch (error) {
      throw new DatabaseError('Failed to find admin', error);
    }
  }

  async createAdmin(data: Omit<Admin, 'id' | 'createdAt'>): Promise<Admin> {
    const pool = this.ensurePool();
    const id = uuidv4();
    const now = new Date();

    try {
      await pool.execute(
        'INSERT INTO admins (id, discordId, username, permissions, createdAt) VALUES (?, ?, ?, ?, ?)',
        [id, data.discordId, data.username, JSON.stringify(data.permissions), now]
      );

      logger.info('Admin created', { adminId: id });

      return {
        id,
        ...data,
        createdAt: now
      };
    } catch (error) {
      throw new DatabaseError('Failed to create admin', error);
    }
  }

  private rowToTransaction(row: any): Transaction {
    return {
      id: row.id,
      orderId: row.orderId,
      userId: row.userId,
      productId: row.productId,
      amount: parseFloat(row.amount),
      currency: row.currency,
      status: row.status,
      paymentMethod: row.paymentMethod,
      paymentLink: row.paymentLink,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      completedAt: row.completedAt ? new Date(row.completedAt) : undefined
    };
  }
}
