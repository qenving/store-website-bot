import { transactionEngine } from '../../src/core/transactions/TransactionEngine';
import { dal } from '../../src/core/db/dal';
import { JSONDriver } from '../../src/core/db/drivers/jsonDriver';
import { configManager } from '../../src/core/config/config';
import * as path from 'path';
import * as fs from 'fs';

describe('Transaction Engine', () => {
  const testStoragePath = path.join(process.cwd(), 'storage', 'test-engine');

  beforeAll(async () => {
    process.env.DB_DRIVER = 'json';
    process.env.DISCORD_TOKEN = 'test_token';
    process.env.DISCORD_CLIENT_ID = 'test_client_id';

    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true });
    }
    fs.mkdirSync(testStoragePath, { recursive: true });

    (dal as any).driver = new JSONDriver(testStoragePath);
    await (dal as any).driver.connect();
    (dal as any).initialized = true;

    configManager.load();
  });

  afterAll(async () => {
    await dal.shutdown();

    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true });
    }
  });

  describe('Order Creation', () => {
    let testUserId: string;

    beforeAll(async () => {
      const user = await dal.users.create({
        discordId: 'engine_test_user',
        username: 'engineuser',
        balance: 0
      });
      testUserId = user.id;
    });

    it('should create an order successfully', async () => {
      const products = configManager.getAllProducts();
      const product = products[0];

      const result = await transactionEngine.createOrder({
        userId: testUserId,
        productId: product.id,
        amount: product.price,
        currency: product.currency
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.orderId).toBeDefined();
      expect(result.transactionId).toBeDefined();
      expect(result.paymentLink).toBeDefined();
    });

    it('should fail when user does not exist', async () => {
      const products = configManager.getAllProducts();
      const product = products[0];

      await expect(
        transactionEngine.createOrder({
          userId: 'non_existent_user',
          productId: product.id,
          amount: product.price,
          currency: product.currency
        })
      ).rejects.toThrow();
    });

    it('should fail when product does not exist', async () => {
      await expect(
        transactionEngine.createOrder({
          userId: testUserId,
          productId: 'non_existent_product',
          amount: 10000,
          currency: 'IDR'
        })
      ).rejects.toThrow();
    });

    it('should fail when amount does not match product price', async () => {
      const products = configManager.getAllProducts();
      const product = products[0];

      await expect(
        transactionEngine.createOrder({
          userId: testUserId,
          productId: product.id,
          amount: product.price + 1000,
          currency: product.currency
        })
      ).rejects.toThrow();
    });
  });

  describe('Transaction Status', () => {
    let testUserId: string;
    let testOrderId: string;

    beforeAll(async () => {
      const user = await dal.users.create({
        discordId: 'status_test_user',
        username: 'statususer',
        balance: 0
      });
      testUserId = user.id;

      const products = configManager.getAllProducts();
      const product = products[0];

      const result = await transactionEngine.createOrder({
        userId: testUserId,
        productId: product.id,
        amount: product.price,
        currency: product.currency
      });

      testOrderId = result.orderId;
    });

    it('should get transaction status by order id', async () => {
      const transaction = await transactionEngine.getStatus(testOrderId);

      expect(transaction).toBeDefined();
      expect(transaction.orderId).toBe(testOrderId);
    });

    it('should fail when order id does not exist', async () => {
      await expect(
        transactionEngine.getStatus('non_existent_order')
      ).rejects.toThrow();
    });
  });

  describe('Transaction State Update', () => {
    let testUserId: string;
    let testOrderId: string;

    beforeAll(async () => {
      const user = await dal.users.create({
        discordId: 'update_test_user',
        username: 'updateuser',
        balance: 0
      });
      testUserId = user.id;

      const products = configManager.getAllProducts();
      const product = products[0];

      const result = await transactionEngine.createOrder({
        userId: testUserId,
        productId: product.id,
        amount: product.price,
        currency: product.currency
      });

      testOrderId = result.orderId;
    });

    it('should update transaction state', async () => {
      const updated = await transactionEngine.updateState(testOrderId, {
        status: 'completed'
      });

      expect(updated).toBeDefined();
      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeDefined();
    });

    it('should update transaction with payment method', async () => {
      const products = configManager.getAllProducts();
      const product = products[0];

      const result = await transactionEngine.createOrder({
        userId: testUserId,
        productId: product.id,
        amount: product.price,
        currency: product.currency
      });

      const updated = await transactionEngine.updateState(result.orderId, {
        paymentMethod: 'credit_card'
      });

      expect(updated.paymentMethod).toBe('credit_card');
    });
  });

  describe('User Transactions', () => {
    let testUserId: string;

    beforeAll(async () => {
      const user = await dal.users.create({
        discordId: 'multi_tx_user',
        username: 'multitxuser',
        balance: 0
      });
      testUserId = user.id;

      const products = configManager.getAllProducts();
      const product = products[0];

      await transactionEngine.createOrder({
        userId: testUserId,
        productId: product.id,
        amount: product.price,
        currency: product.currency
      });

      await transactionEngine.createOrder({
        userId: testUserId,
        productId: product.id,
        amount: product.price,
        currency: product.currency
      });
    });

    it('should get all transactions for a user', async () => {
      const transactions = await transactionEngine.getUserTransactions(testUserId);

      expect(transactions).toBeDefined();
      expect(transactions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Transaction Cancellation', () => {
    let testUserId: string;
    let testOrderId: string;

    beforeAll(async () => {
      const user = await dal.users.create({
        discordId: 'cancel_test_user',
        username: 'canceluser',
        balance: 0
      });
      testUserId = user.id;

      const products = configManager.getAllProducts();
      const product = products[0];

      const result = await transactionEngine.createOrder({
        userId: testUserId,
        productId: product.id,
        amount: product.price,
        currency: product.currency
      });

      testOrderId = result.orderId;
    });

    it('should cancel a pending transaction', async () => {
      const cancelled = await transactionEngine.cancelTransaction(testOrderId);

      expect(cancelled).toBeDefined();
      expect(cancelled.status).toBe('cancelled');
    });

    it('should fail to cancel a completed transaction', async () => {
      const products = configManager.getAllProducts();
      const product = products[0];

      const result = await transactionEngine.createOrder({
        userId: testUserId,
        productId: product.id,
        amount: product.price,
        currency: product.currency
      });

      await transactionEngine.updateState(result.orderId, {
        status: 'completed'
      });

      await expect(
        transactionEngine.cancelTransaction(result.orderId)
      ).rejects.toThrow();
    });
  });
});
