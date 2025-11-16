import * as crypto from 'crypto';
import { createLogger } from '../logging/logger';
import { getEncryptionService } from './encryption';
import { dal } from '../db/dal';

const logger = createLogger({ module: 'TOTPService' });

const TOTP_WINDOW = 1; // Allow 1 step before/after
const TOTP_PERIOD = 30; // 30 seconds
const TOTP_DIGITS = 6;

export interface TOTPSecret {
  userId: string;
  secret: string;
  backupCodes: string[];
  enabled: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface TOTPSetupData {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

/**
 * TOTP (Time-based One-Time Password) Service
 * Implements 2FA using Google Authenticator compatible tokens
 */
export class TOTPService {
  private encryption = getEncryptionService();

  /**
   * Generate new TOTP secret for user
   */
  generateSecret(userId: string, appName: string = 'Discord Store Bot'): TOTPSetupData {
    // Generate random secret (base32)
    const secret = this.generateBase32Secret();

    // Generate backup codes
    const backupCodes = this.generateBackupCodes(10);

    // Generate QR code URL
    const qrCodeUrl = this.generateQRCodeUrl(userId, secret, appName);

    logger.info('TOTP secret generated', { userId });

    return {
      secret,
      qrCodeUrl,
      backupCodes
    };
  }

  /**
   * Enable TOTP for user after verification
   */
  async enableTOTP(userId: string, secret: string, token: string, backupCodes: string[]): Promise<boolean> {
    // Verify token first
    const isValid = this.verifyToken(secret, token);

    if (!isValid) {
      logger.warn('TOTP enable failed: invalid token', { userId });
      return false;
    }

    // Encrypt secret and backup codes
    const encryptedSecret = this.encryption.encryptData(secret);
    const encryptedBackupCodes = backupCodes.map(code =>
      this.encryption.encryptData(code)
    );

    // Save to database
    try {
      await dal.execute(
        `INSERT INTO user_totp
        (userId, secret, backupCodes, enabled, createdAt)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        secret = VALUES(secret),
        backupCodes = VALUES(backupCodes),
        enabled = VALUES(enabled),
        createdAt = VALUES(createdAt)`,
        [
          userId,
          encryptedSecret,
          JSON.stringify(encryptedBackupCodes),
          true,
          new Date()
        ]
      );

      logger.info('TOTP enabled for user', { userId });
      return true;
    } catch (error) {
      logger.error('Failed to enable TOTP', error);
      throw error;
    }
  }

  /**
   * Disable TOTP for user
   */
  async disableTOTP(userId: string): Promise<boolean> {
    try {
      await dal.execute(
        'UPDATE user_totp SET enabled = false WHERE userId = ?',
        [userId]
      );

      logger.info('TOTP disabled for user', { userId });
      return true;
    } catch (error) {
      logger.error('Failed to disable TOTP', error);
      return false;
    }
  }

  /**
   * Verify TOTP token
   */
  verifyToken(secret: string, token: string): boolean {
    const now = Math.floor(Date.now() / 1000);

    // Check current time and window
    for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
      const time = now + (i * TOTP_PERIOD);
      const expectedToken = this.generateTOTP(secret, time);

      if (expectedToken === token) {
        return true;
      }
    }

    return false;
  }

  /**
   * Verify TOTP for user
   */
  async verifyUserTOTP(userId: string, token: string): Promise<boolean> {
    try {
      const totpData = await this.getTOTPData(userId);

      if (!totpData || !totpData.enabled) {
        logger.warn('TOTP not enabled for user', { userId });
        return false;
      }

      // Decrypt secret
      const secret = this.encryption.decryptData(totpData.secret);

      // Verify token
      const isValid = this.verifyToken(secret, token);

      if (isValid) {
        // Update last used time
        await dal.execute(
          'UPDATE user_totp SET lastUsedAt = ? WHERE userId = ?',
          [new Date(), userId]
        );

        logger.info('TOTP verified successfully', { userId });
      } else {
        logger.warn('TOTP verification failed', { userId });
      }

      return isValid;
    } catch (error) {
      logger.error('TOTP verification error', error);
      return false;
    }
  }

  /**
   * Verify backup code
   */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    try {
      const totpData = await this.getTOTPData(userId);

      if (!totpData || !totpData.enabled) {
        return false;
      }

      // Decrypt backup codes
      const encryptedCodes = JSON.parse(totpData.backupCodes);
      const backupCodes = encryptedCodes.map((enc: string) =>
        this.encryption.decryptData(enc)
      );

      // Check if code matches
      const index = backupCodes.indexOf(code);

      if (index === -1) {
        logger.warn('Invalid backup code', { userId });
        return false;
      }

      // Remove used backup code
      backupCodes.splice(index, 1);

      // Re-encrypt and save
      const newEncryptedCodes = backupCodes.map(c =>
        this.encryption.encryptData(c)
      );

      await dal.execute(
        'UPDATE user_totp SET backupCodes = ?, lastUsedAt = ? WHERE userId = ?',
        [JSON.stringify(newEncryptedCodes), new Date(), userId]
      );

      logger.info('Backup code used successfully', { userId, remaining: backupCodes.length });

      return true;
    } catch (error) {
      logger.error('Backup code verification error', error);
      return false;
    }
  }

  /**
   * Get TOTP data for user
   */
  async getTOTPData(userId: string): Promise<TOTPSecret | null> {
    try {
      const rows = await dal.query<any>(
        'SELECT * FROM user_totp WHERE userId = ?',
        [userId]
      );

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];

      return {
        userId: row.userId,
        secret: row.secret,
        backupCodes: row.backupCodes,
        enabled: Boolean(row.enabled),
        createdAt: new Date(row.createdAt),
        lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt) : null
      };
    } catch (error) {
      logger.error('Failed to get TOTP data', error);
      return null;
    }
  }

  /**
   * Check if TOTP is enabled for user
   */
  async isTOTPEnabled(userId: string): Promise<boolean> {
    const data = await this.getTOTPData(userId);
    return data?.enabled || false;
  }

  /**
   * Generate backup codes
   */
  async regenerateBackupCodes(userId: string): Promise<string[]> {
    const backupCodes = this.generateBackupCodes(10);

    // Encrypt backup codes
    const encryptedCodes = backupCodes.map(code =>
      this.encryption.encryptData(code)
    );

    // Update database
    await dal.execute(
      'UPDATE user_totp SET backupCodes = ? WHERE userId = ?',
      [JSON.stringify(encryptedCodes), userId]
    );

    logger.info('Backup codes regenerated', { userId });

    return backupCodes;
  }

  /**
   * Generate TOTP token
   */
  private generateTOTP(secret: string, time?: number): string {
    const epoch = time || Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / TOTP_PERIOD);

    // Decode base32 secret
    const key = this.base32Decode(secret);

    // Generate HMAC
    const hmac = crypto.createHmac('sha1', key);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    hmac.update(counterBuffer);
    const hash = hmac.digest();

    // Dynamic truncation
    const offset = hash[hash.length - 1] & 0x0f;
    const binary =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);

    const otp = binary % Math.pow(10, TOTP_DIGITS);

    return otp.toString().padStart(TOTP_DIGITS, '0');
  }

  /**
   * Generate base32 secret
   */
  private generateBase32Secret(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';

    for (let i = 0; i < length; i++) {
      secret += chars[Math.floor(Math.random() * chars.length)];
    }

    return secret;
  }

  /**
   * Decode base32
   */
  private base32Decode(encoded: string): Buffer {
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    const output: number[] = [];

    for (let i = 0; i < encoded.length; i++) {
      const char = encoded[i].toUpperCase();
      const index = base32Chars.indexOf(char);

      if (index === -1) {
        continue;
      }

      value = (value << 5) | index;
      bits += 5;

      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }

    return Buffer.from(output);
  }

  /**
   * Generate QR code URL
   */
  private generateQRCodeUrl(userId: string, secret: string, appName: string): string {
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(appName)}:${encodeURIComponent(userId)}?secret=${secret}&issuer=${encodeURIComponent(appName)}`;
    return `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(otpauthUrl)}`;
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }

    return codes;
  }
}

// Singleton instance
let totpService: TOTPService | null = null;

export function getTOTPService(): TOTPService {
  if (!totpService) {
    totpService = new TOTPService();
  }

  return totpService;
}

export function createTOTPService(): TOTPService {
  return new TOTPService();
}
