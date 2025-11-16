import { dal } from '../../src/core/db/dal';
import { JSONDriver } from '../../src/core/db/drivers/jsonDriver';
import * as path from 'path';
import * as fs from 'fs';

describe('Database Abstraction Layer', () => {
  const testStoragePath = path.join(process.cwd(), 'storage', 'test');

  beforeAll(async () => {
    process.env.DB_DRIVER = 'json';

    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true });
    }
    fs.mkdirSync(testStoragePath, { recursive: true });

    (dal as any).driver = new JSONDriver(testStoragePath);
    await (dal as any).driver.connect();
    (dal as any).initialized = true;
  });

  afterAll(async () => {
    await dal.shutdown();

    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true });
    }
  });

  describe('Users', () => {
    it('should create a new user', async () => {
      const user = await dal.users.create({
        discordId: '123456789',
        username: 'testuser',
        balance: 0
      });

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.discordId).toBe('123456789');
      expect(user.username).toBe('testuser');
      expect(user.balance).toBe(0);
    });

    it('should find user by id', async () => {
      const createdUser = await dal.users.create({
        discordId: '987654321',
        username: 'testuser2',
        balance: 100
      });

      const foundUser = await dal.users.findById(createdUser.id);

      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(createdUser.id);
      expect(foundUser?.discordId).toBe('987654321');
    });

    it('should find user by discord id', async () => {
      const createdUser = await dal.users.create({
        discordId: '111222333',
        username: 'testuser3',
        balance: 0
      });

      const foundUser = await dal.users.findByDiscordId('111222333');

      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(createdUser.id);
    });

    it('should update user', async () => {
      const createdUser = await dal.users.create({
        discordId: '444555666',
        username: 'testuser4',
        balance: 0
      });

      const updatedUser = await dal.users.update(createdUser.id, {
        balance: 500
      });

      expect(updatedUser.balance).toBe(500);
    });

    it('should get or create user', async () => {
      const user1 = await dal.users.getOrCreate('999888777', 'newuser');
      expect(user1).toBeDefined();
      expect(user1.discordId).toBe('999888777');

      const user2 = await dal.users.getOrCreate('999888777', 'newuser');
      expect(user2.id).toBe(user1.id);
    });
  });

  describe('Transactions', () => {
    let testUserId: string;

    beforeAll(async () => {
      const user = await dal.users.create({
        discordId: 'tx_user_123',
        username: 'txuser',
        balance: 0
      });
      testUserId = user.id;
    });

    it('should create a transaction', async () => {
      const transaction = await dal.transactions.create({
        orderId: 'ORD-TEST-001',
        userId: testUserId,
        productId: 'product_1',
        amount: 10000,
        currency: 'IDR',
        status: 'pending'
      });

      expect(transaction).toBeDefined();
      expect(transaction.id).toBeDefined();
      expect(transaction.orderId).toBe('ORD-TEST-001');
      expect(transaction.status).toBe('pending');
    });

    it('should find transaction by id', async () => {
      const created = await dal.transactions.create({
        orderId: 'ORD-TEST-002',
        userId: testUserId,
        productId: 'product_1',
        amount: 10000,
        currency: 'IDR',
        status: 'pending'
      });

      const found = await dal.transactions.findById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should find transaction by order id', async () => {
      const created = await dal.transactions.create({
        orderId: 'ORD-TEST-003',
        userId: testUserId,
        productId: 'product_1',
        amount: 10000,
        currency: 'IDR',
        status: 'pending'
      });

      const found = await dal.transactions.findByOrderId('ORD-TEST-003');

      expect(found).toBeDefined();
      expect(found?.orderId).toBe('ORD-TEST-003');
    });

    it('should update transaction state', async () => {
      const created = await dal.transactions.create({
        orderId: 'ORD-TEST-004',
        userId: testUserId,
        productId: 'product_1',
        amount: 10000,
        currency: 'IDR',
        status: 'pending'
      });

      const updated = await dal.transactions.updateState(created.id, {
        status: 'completed',
        completedAt: new Date()
      });

      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeDefined();
    });

    it('should find transactions by user id', async () => {
      await dal.transactions.create({
        orderId: 'ORD-TEST-005',
        userId: testUserId,
        productId: 'product_1',
        amount: 10000,
        currency: 'IDR',
        status: 'pending'
      });

      const transactions = await dal.transactions.findByUserId(testUserId);

      expect(transactions).toBeDefined();
      expect(transactions.length).toBeGreaterThan(0);
    });
  });

  describe('Balances', () => {
    let balanceUserId: string;

    beforeAll(async () => {
      const user = await dal.users.create({
        discordId: 'balance_user_123',
        username: 'balanceuser',
        balance: 0
      });
      balanceUserId = user.id;
    });

    it('should upsert balance', async () => {
      const balance = await dal.balances.upsert(balanceUserId, 5000, 'IDR');

      expect(balance).toBeDefined();
      expect(balance.userId).toBe(balanceUserId);
      expect(balance.amount).toBe(5000);
    });

    it('should find balance by user id', async () => {
      await dal.balances.upsert(balanceUserId, 7500, 'IDR');

      const balance = await dal.balances.findByUserId(balanceUserId);

      expect(balance).toBeDefined();
      expect(balance?.amount).toBe(7500);
    });

    it('should update existing balance', async () => {
      await dal.balances.upsert(balanceUserId, 1000, 'IDR');
      const balance = await dal.balances.upsert(balanceUserId, 2000, 'IDR');

      expect(balance.amount).toBe(2000);
    });
  });

  describe('Settings', () => {
    it('should set a setting', async () => {
      const setting = await dal.settings.set('test_key', { value: 'test_value' });

      expect(setting).toBeDefined();
      expect(setting.key).toBe('test_key');
      expect(setting.value.value).toBe('test_value');
    });

    it('should get a setting', async () => {
      await dal.settings.set('another_key', { data: 123 });

      const setting = await dal.settings.get('another_key');

      expect(setting).toBeDefined();
      expect(setting?.value.data).toBe(123);
    });

    it('should return null for non-existent setting', async () => {
      const setting = await dal.settings.get('non_existent_key');

      expect(setting).toBeNull();
    });
  });
});
