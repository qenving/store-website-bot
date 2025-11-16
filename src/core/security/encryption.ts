import * as crypto from 'crypto';
import { createLogger } from '../logging/logger';
import { getSecretManager, SecretKey } from './secretManager';

const logger = createLogger({ module: 'Encryption' });

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
  salt: string;
}

/**
 * Encryption Service for data at rest
 * Uses AES-256-GCM for authenticated encryption
 */
export class EncryptionService {
  private secretManager = getSecretManager();

  /**
   * Encrypt data
   */
  encryptData(plaintext: string | Buffer): string {
    try {
      const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;

      // Generate random IV and salt
      const iv = crypto.randomBytes(IV_LENGTH);
      const salt = crypto.randomBytes(SALT_LENGTH);

      // Derive key from master encryption key
      const key = this.deriveKey(salt);

      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

      // Encrypt data
      const encrypted = Buffer.concat([
        cipher.update(data),
        cipher.final()
      ]);

      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Combine all components
      const result: EncryptedData = {
        ciphertext: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        salt: salt.toString('base64')
      };

      // Return as single base64 string
      return Buffer.from(JSON.stringify(result)).toString('base64');
    } catch (error) {
      logger.error('Encryption failed', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data
   */
  decryptData(ciphertext: string): string {
    try {
      // Parse encrypted data
      const dataStr = Buffer.from(ciphertext, 'base64').toString('utf8');
      const data: EncryptedData = JSON.parse(dataStr);

      // Convert from base64
      const encrypted = Buffer.from(data.ciphertext, 'base64');
      const iv = Buffer.from(data.iv, 'base64');
      const tag = Buffer.from(data.tag, 'base64');
      const salt = Buffer.from(data.salt, 'base64');

      // Derive key
      const key = this.deriveKey(salt);

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);

      // Decrypt data
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      logger.error('Decryption failed', error);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Encrypt object (JSON)
   */
  encryptObject<T = any>(obj: T): string {
    const json = JSON.stringify(obj);
    return this.encryptData(json);
  }

  /**
   * Decrypt object (JSON)
   */
  decryptObject<T = any>(ciphertext: string): T {
    const json = this.decryptData(ciphertext);
    return JSON.parse(json) as T;
  }

  /**
   * Hash data (one-way)
   */
  hash(data: string): string {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }

  /**
   * Hash password with salt (for storage)
   */
  hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha512')
      .toString('hex');

    return `${salt}:${hash}`;
  }

  /**
   * Verify password against hash
   */
  verifyPassword(password: string, storedHash: string): boolean {
    try {
      const [salt, hash] = storedHash.split(':');

      const verifyHash = crypto
        .pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha512')
        .toString('hex');

      return hash === verifyHash;
    } catch (error) {
      logger.error('Password verification failed', error);
      return false;
    }
  }

  /**
   * Generate secure random token
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Generate random bytes
   */
  generateRandomBytes(length: number): Buffer {
    return crypto.randomBytes(length);
  }

  /**
   * HMAC sign data
   */
  sign(data: string, secret?: string): string {
    const key = secret || this.secretManager.getSecret(SecretKey.SESSION_SIGNING_KEY) || 'default-key';

    return crypto
      .createHmac('sha256', key)
      .update(data)
      .digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  verify(data: string, signature: string, secret?: string): boolean {
    const expectedSignature = this.sign(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Derive encryption key from master key + salt
   */
  private deriveKey(salt: Buffer): Buffer {
    const masterKey = this.secretManager.getSecret(SecretKey.ENCRYPTION_KEY);

    if (!masterKey) {
      throw new Error('ENCRYPTION_KEY not configured');
    }

    return crypto.pbkdf2Sync(
      masterKey,
      salt,
      ITERATIONS,
      KEY_LENGTH,
      'sha512'
    );
  }

  /**
   * Encrypt sensitive fields in object
   */
  encryptFields<T extends Record<string, any>>(
    obj: T,
    fields: (keyof T)[]
  ): T {
    const result = { ...obj };

    for (const field of fields) {
      if (result[field] !== undefined && result[field] !== null) {
        const value = String(result[field]);
        result[field] = this.encryptData(value) as any;
      }
    }

    return result;
  }

  /**
   * Decrypt sensitive fields in object
   */
  decryptFields<T extends Record<string, any>>(
    obj: T,
    fields: (keyof T)[]
  ): T {
    const result = { ...obj };

    for (const field of fields) {
      if (result[field] !== undefined && result[field] !== null) {
        try {
          const encrypted = String(result[field]);
          result[field] = this.decryptData(encrypted) as any;
        } catch (error) {
          logger.error(`Failed to decrypt field: ${String(field)}`, error);
          // Leave field as-is if decryption fails
        }
      }
    }

    return result;
  }
}

// Singleton instance
let encryptionService: EncryptionService | null = null;

export function getEncryptionService(): EncryptionService {
  if (!encryptionService) {
    encryptionService = new EncryptionService();
  }

  return encryptionService;
}

export function createEncryptionService(): EncryptionService {
  return new EncryptionService();
}
