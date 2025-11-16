import { EventEmitter } from 'events';
import { createLogger } from '../logging/logger';
import { getSecretManager, SecretKey } from './secretManager';
import { getEncryptionService } from './encryption';
import { dal } from '../db/dal';

const logger = createLogger({ module: 'KeyRotation' });

export enum KeyType {
  JWT_SECRET = 'JWT_SECRET',
  SESSION_SIGNING_KEY = 'SESSION_SIGNING_KEY',
  ENCRYPTION_KEY = 'ENCRYPTION_KEY',
  DASHBOARD_IPC_TOKEN = 'DASHBOARD_IPC_TOKEN',
  INTERNAL_API_TOKEN = 'INTERNAL_API_TOKEN',
  GATEWAY_KEY = 'GATEWAY_KEY'
}

export interface KeyRotationRecord {
  id: string;
  keyType: KeyType | string;
  adminId: string;
  adminEmail: string;
  oldKeyHash: string;
  newKeyHash: string;
  rotatedAt: Date;
  reason: string;
  gracePeriodEnd?: Date;
}

export interface RotationConfig {
  gracePeriodDays?: number;
  notifyAdmins?: boolean;
  forceLogout?: boolean;
}

/**
 * Key Rotation Service
 * Handles secure rotation of cryptographic keys and API secrets
 */
export class KeyRotationService extends EventEmitter {
  private secretManager = getSecretManager();
  private encryption = getEncryptionService();
  private readonly JWT_GRACE_PERIOD_DAYS = 7;

  /**
   * Rotate JWT secret with grace period
   */
  async rotateJWTSecret(adminId: string, adminEmail: string, config: RotationConfig = {}): Promise<KeyRotationRecord> {
    logger.info('Starting JWT secret rotation', { adminId });

    const oldSecret = this.secretManager.getSecret(SecretKey.JWT_SECRET);

    if (!oldSecret) {
      throw new Error('Current JWT_SECRET not found');
    }

    // Generate new secret
    const newSecret = this.encryption.generateToken(64);

    // Update secret manager
    this.secretManager.setSecret(SecretKey.JWT_SECRET, newSecret);

    // Previous secret is automatically saved by secretManager

    // Calculate grace period
    const gracePeriodDays = config.gracePeriodDays || this.JWT_GRACE_PERIOD_DAYS;
    const gracePeriodEnd = new Date();
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);

    // Create rotation record
    const record: KeyRotationRecord = {
      id: this.encryption.generateToken(16),
      keyType: KeyType.JWT_SECRET,
      adminId,
      adminEmail,
      oldKeyHash: this.encryption.hash(oldSecret),
      newKeyHash: this.encryption.hash(newSecret),
      rotatedAt: new Date(),
      reason: 'Manual rotation',
      gracePeriodEnd
    };

    // Save rotation record
    await this.saveRotationRecord(record);

    logger.info('JWT secret rotated successfully', {
      adminId,
      gracePeriodEnd
    });

    this.emit('keyRotated', record);

    return record;
  }

  /**
   * Rotate session signing key
   */
  async rotateSessionKey(adminId: string, adminEmail: string, config: RotationConfig = {}): Promise<KeyRotationRecord> {
    logger.info('Starting session key rotation', { adminId });

    const oldKey = this.secretManager.getSecret(SecretKey.SESSION_SIGNING_KEY);

    if (!oldKey) {
      throw new Error('Current SESSION_SIGNING_KEY not found');
    }

    // Generate new key
    const newKey = this.encryption.generateToken(64);

    // Update secret manager
    this.secretManager.setSecret(SecretKey.SESSION_SIGNING_KEY, newKey);

    // Create rotation record
    const record: KeyRotationRecord = {
      id: this.encryption.generateToken(16),
      keyType: KeyType.SESSION_SIGNING_KEY,
      adminId,
      adminEmail,
      oldKeyHash: this.encryption.hash(oldKey),
      newKeyHash: this.encryption.hash(newKey),
      rotatedAt: new Date(),
      reason: 'Manual rotation'
    };

    // Save rotation record
    await this.saveRotationRecord(record);

    // Force logout if configured
    if (config.forceLogout) {
      logger.info('Forcing logout of all sessions after key rotation');
      this.emit('forceLogoutAll');
    }

    logger.info('Session key rotated successfully', { adminId });

    this.emit('keyRotated', record);

    return record;
  }

  /**
   * Rotate dashboard IPC token
   */
  async rotateDashboardIPCToken(adminId: string, adminEmail: string): Promise<KeyRotationRecord> {
    logger.info('Starting dashboard IPC token rotation', { adminId });

    const oldToken = this.secretManager.getSecret(SecretKey.DASHBOARD_IPC_TOKEN);

    if (!oldToken) {
      throw new Error('Current DASHBOARD_IPC_TOKEN not found');
    }

    // Generate new token
    const newToken = this.encryption.generateToken(64);

    // Update secret manager
    this.secretManager.setSecret(SecretKey.DASHBOARD_IPC_TOKEN, newToken);

    // Create rotation record
    const record: KeyRotationRecord = {
      id: this.encryption.generateToken(16),
      keyType: KeyType.DASHBOARD_IPC_TOKEN,
      adminId,
      adminEmail,
      oldKeyHash: this.encryption.hash(oldToken),
      newKeyHash: this.encryption.hash(newToken),
      rotatedAt: new Date(),
      reason: 'Manual rotation'
    };

    // Save rotation record
    await this.saveRotationRecord(record);

    logger.info('Dashboard IPC token rotated successfully', { adminId });

    this.emit('keyRotated', record);

    return record;
  }

  /**
   * Rotate gateway API key
   */
  async rotateGatewayKey(
    gateway: string,
    newKey: string,
    adminId: string,
    adminEmail: string
  ): Promise<KeyRotationRecord> {
    logger.info('Starting gateway key rotation', { gateway, adminId });

    const secretKey = `${gateway.toUpperCase()}_API_KEY` as SecretKey;
    const oldKey = this.secretManager.getSecret(secretKey);

    if (!oldKey) {
      logger.warn(`No existing key for ${gateway}, setting new key`);
    }

    // Update secret manager
    this.secretManager.setSecret(secretKey, newKey);

    // Create rotation record
    const record: KeyRotationRecord = {
      id: this.encryption.generateToken(16),
      keyType: `GATEWAY_KEY:${gateway}`,
      adminId,
      adminEmail,
      oldKeyHash: oldKey ? this.encryption.hash(oldKey) : 'N/A',
      newKeyHash: this.encryption.hash(newKey),
      rotatedAt: new Date(),
      reason: `Gateway key rotation: ${gateway}`
    };

    // Save rotation record
    await this.saveRotationRecord(record);

    logger.info('Gateway key rotated successfully', { gateway, adminId });

    this.emit('keyRotated', record);

    return record;
  }

  /**
   * Clean up expired JWT previous secret
   */
  async cleanupExpiredJWTSecret(): Promise<void> {
    logger.info('Checking for expired JWT previous secret...');

    const records = await this.getRotationHistory(KeyType.JWT_SECRET, 1);

    if (records.length === 0) {
      return;
    }

    const latestRotation = records[0];

    if (!latestRotation.gracePeriodEnd) {
      return;
    }

    const now = new Date();

    if (now > latestRotation.gracePeriodEnd) {
      // Grace period expired, remove previous secret
      this.secretManager.deleteSecret(SecretKey.JWT_SECRET_PREVIOUS);
      logger.info('Expired JWT previous secret cleaned up');
    }
  }

  /**
   * Get rotation history
   */
  async getRotationHistory(keyType?: KeyType | string, limit: number = 50): Promise<KeyRotationRecord[]> {
    try {
      let query = 'SELECT * FROM key_rotation_logs';
      const params: any[] = [];

      if (keyType) {
        query += ' WHERE keyType = ?';
        params.push(keyType);
      }

      query += ' ORDER BY rotatedAt DESC LIMIT ?';
      params.push(limit);

      const rows = await dal.query<any>(query, params);

      return rows.map(row => ({
        id: row.id,
        keyType: row.keyType,
        adminId: row.adminId,
        adminEmail: row.adminEmail,
        oldKeyHash: row.oldKeyHash,
        newKeyHash: row.newKeyHash,
        rotatedAt: new Date(row.rotatedAt),
        reason: row.reason,
        gracePeriodEnd: row.gracePeriodEnd ? new Date(row.gracePeriodEnd) : undefined
      }));
    } catch (error) {
      logger.error('Failed to get rotation history', error);
      return [];
    }
  }

  /**
   * Check if key needs rotation
   */
  async checkRotationNeeded(keyType: KeyType): Promise<boolean> {
    const records = await this.getRotationHistory(keyType, 1);

    if (records.length === 0) {
      return true; // Never rotated
    }

    const lastRotation = records[0];
    const daysSinceRotation = Math.floor(
      (Date.now() - lastRotation.rotatedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // JWT and session keys: rotate every 30 days
    if ([KeyType.JWT_SECRET, KeyType.SESSION_SIGNING_KEY].includes(keyType)) {
      return daysSinceRotation >= 30;
    }

    return false;
  }

  /**
   * Get rotation status for all keys
   */
  async getRotationStatus(): Promise<Array<{
    keyType: KeyType;
    lastRotated: Date | null;
    daysSinceRotation: number | null;
    needsRotation: boolean;
  }>> {
    const keyTypes = [
      KeyType.JWT_SECRET,
      KeyType.SESSION_SIGNING_KEY,
      KeyType.DASHBOARD_IPC_TOKEN
    ];

    const statuses = await Promise.all(
      keyTypes.map(async (keyType) => {
        const records = await this.getRotationHistory(keyType, 1);
        const lastRotation = records[0];

        let daysSinceRotation: number | null = null;
        if (lastRotation) {
          daysSinceRotation = Math.floor(
            (Date.now() - lastRotation.rotatedAt.getTime()) / (1000 * 60 * 60 * 24)
          );
        }

        const needsRotation = await this.checkRotationNeeded(keyType);

        return {
          keyType,
          lastRotated: lastRotation?.rotatedAt || null,
          daysSinceRotation,
          needsRotation
        };
      })
    );

    return statuses;
  }

  /**
   * Save rotation record to database
   */
  private async saveRotationRecord(record: KeyRotationRecord): Promise<void> {
    try {
      await dal.execute(
        `INSERT INTO key_rotation_logs
        (id, keyType, adminId, adminEmail, oldKeyHash, newKeyHash, rotatedAt, reason, gracePeriodEnd)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.keyType,
          record.adminId,
          record.adminEmail,
          record.oldKeyHash,
          record.newKeyHash,
          record.rotatedAt,
          record.reason,
          record.gracePeriodEnd || null
        ]
      );

      logger.info('Rotation record saved', { recordId: record.id });
    } catch (error) {
      logger.error('Failed to save rotation record', error);
      throw error;
    }
  }

  /**
   * Initialize rotation scheduler
   */
  startScheduledRotation(): void {
    // Check for needed rotations daily
    setInterval(() => {
      this.checkAndRotateIfNeeded().catch(error => {
        logger.error('Scheduled rotation check failed', error);
      });
    }, 24 * 60 * 60 * 1000); // Every 24 hours

    logger.info('Scheduled key rotation started');
  }

  /**
   * Check and rotate if needed
   */
  private async checkAndRotateIfNeeded(): Promise<void> {
    logger.info('Checking for keys requiring rotation...');

    const status = await this.getRotationStatus();

    for (const item of status) {
      if (item.needsRotation) {
        logger.warn(`Key ${item.keyType} requires rotation`, {
          lastRotated: item.lastRotated,
          daysSinceRotation: item.daysSinceRotation
        });

        // Emit event for admin notification
        this.emit('rotationNeeded', item);
      }
    }
  }
}

// Singleton instance
let keyRotationService: KeyRotationService | null = null;

export function getKeyRotationService(): KeyRotationService {
  if (!keyRotationService) {
    keyRotationService = new KeyRotationService();
  }

  return keyRotationService;
}

export function createKeyRotationService(): KeyRotationService {
  return new KeyRotationService();
}
