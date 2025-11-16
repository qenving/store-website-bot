import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../logging/logger';
import { EventEmitter } from 'events';

const logger = createLogger({ module: 'SecretManager' });

export enum SecretKey {
  JWT_SECRET = 'JWT_SECRET',
  JWT_SECRET_PREVIOUS = 'JWT_SECRET_PREVIOUS',
  DASHBOARD_IPC_TOKEN = 'DASHBOARD_IPC_TOKEN',
  SESSION_SIGNING_KEY = 'SESSION_SIGNING_KEY',
  ENCRYPTION_KEY = 'ENCRYPTION_KEY',
  METRICS_TOKEN = 'METRICS_TOKEN',

  // Gateway keys
  MIDTRANS_SERVER_KEY = 'MIDTRANS_SERVER_KEY',
  DUITKU_API_KEY = 'DUITKU_API_KEY',
  TRIPAY_API_KEY = 'TRIPAY_API_KEY',
  XENDIT_API_KEY = 'XENDIT_API_KEY',
  CRYPTOMUS_API_KEY = 'CRYPTOMUS_API_KEY',
  EXCHANGE_API_KEY = 'EXCHANGE_API_KEY',

  // Discord
  DISCORD_TOKEN = 'DISCORD_TOKEN',
  DISCORD_CLIENT_ID = 'DISCORD_CLIENT_ID',
  DISCORD_CLIENT_SECRET = 'DISCORD_CLIENT_SECRET',

  // Database
  MYSQL_PASSWORD = 'MYSQL_PASSWORD',
  REDIS_PASSWORD = 'REDIS_PASSWORD',

  // Alerts
  DISCORD_WEBHOOK_URL = 'DISCORD_WEBHOOK_URL',
  SLACK_WEBHOOK_URL = 'SLACK_WEBHOOK_URL',
  SMTP_PASSWORD = 'SMTP_PASSWORD'
}

export interface SecretMetadata {
  key: string;
  lastRotated: Date | null;
  rotationSchedule: number | null; // days
  isSensitive: boolean;
}

/**
 * Centralized Secret Manager
 * Manages all sensitive credentials and API keys
 */
export class SecretManager extends EventEmitter {
  private secrets: Map<string, string> = new Map();
  private metadata: Map<string, SecretMetadata> = new Map();
  private loaded: boolean = false;

  constructor() {
    super();
  }

  /**
   * Load secrets from environment variables
   */
  loadSecrets(): void {
    if (this.loaded) {
      logger.warn('Secrets already loaded, skipping...');
      return;
    }

    logger.info('Loading secrets from environment...');

    // Load all secrets from environment
    Object.values(SecretKey).forEach(key => {
      const value = process.env[key];

      if (value) {
        this.secrets.set(key, value);
        this.metadata.set(key, {
          key,
          lastRotated: null,
          rotationSchedule: this.getDefaultRotationSchedule(key),
          isSensitive: this.isSensitiveKey(key)
        });
      } else {
        // Only warn for critical secrets
        if (this.isCriticalSecret(key)) {
          logger.warn(`Critical secret not found: ${key}`);
        }
      }
    });

    // Generate runtime secrets if not present
    this.ensureRuntimeSecrets();

    this.loaded = true;
    logger.info(`Loaded ${this.secrets.size} secrets`);

    this.emit('secretsLoaded', this.secrets.size);
  }

  /**
   * Reload secrets (e.g., after rotation)
   */
  reloadSecrets(): void {
    logger.info('Reloading secrets...');

    const oldCount = this.secrets.size;
    this.loaded = false;
    this.loadSecrets();

    logger.info(`Secrets reloaded: ${oldCount} -> ${this.secrets.size}`);
    this.emit('secretsReloaded');
  }

  /**
   * Get secret value
   */
  getSecret(key: SecretKey | string): string | null {
    if (!this.loaded) {
      throw new Error('Secrets not loaded. Call loadSecrets() first.');
    }

    const value = this.secrets.get(key);

    if (!value) {
      logger.debug(`Secret not found: ${key}`);
      return null;
    }

    return value;
  }

  /**
   * Set secret value (for rotation)
   */
  setSecret(key: SecretKey | string, value: string): void {
    const previousValue = this.secrets.get(key);

    this.secrets.set(key, value);

    // Update metadata
    const meta = this.metadata.get(key) || {
      key,
      lastRotated: null,
      rotationSchedule: null,
      isSensitive: this.isSensitiveKey(key)
    };

    meta.lastRotated = new Date();
    this.metadata.set(key, meta);

    // For JWT rotation, keep previous secret
    if (key === SecretKey.JWT_SECRET && previousValue) {
      this.secrets.set(SecretKey.JWT_SECRET_PREVIOUS, previousValue);
      logger.info('JWT_SECRET rotated, previous secret saved');
    }

    logger.info(`Secret updated: ${key}`);
    this.emit('secretUpdated', { key, timestamp: new Date() });
  }

  /**
   * Delete secret
   */
  deleteSecret(key: string): boolean {
    const deleted = this.secrets.delete(key);

    if (deleted) {
      this.metadata.delete(key);
      logger.info(`Secret deleted: ${key}`);
      this.emit('secretDeleted', key);
    }

    return deleted;
  }

  /**
   * Get secret metadata
   */
  getMetadata(key: string): SecretMetadata | null {
    return this.metadata.get(key) || null;
  }

  /**
   * Get all secret keys (not values)
   */
  getSecretKeys(): string[] {
    return Array.from(this.secrets.keys());
  }

  /**
   * Get masked secret for display
   */
  getMaskedSecret(key: string): string | null {
    const value = this.secrets.get(key);

    if (!value) {
      return null;
    }

    if (value.length <= 8) {
      return '***';
    }

    return `${value.substring(0, 4)}${'*'.repeat(value.length - 8)}${value.substring(value.length - 4)}`;
  }

  /**
   * Check if secret exists
   */
  hasSecret(key: string): boolean {
    return this.secrets.has(key);
  }

  /**
   * Ensure runtime secrets are generated
   */
  private ensureRuntimeSecrets(): void {
    // Generate DASHBOARD_IPC_TOKEN if not present
    if (!this.secrets.has(SecretKey.DASHBOARD_IPC_TOKEN)) {
      const token = this.generateSecureToken(64);
      this.secrets.set(SecretKey.DASHBOARD_IPC_TOKEN, token);
      logger.info('Generated runtime DASHBOARD_IPC_TOKEN');
    }

    // Generate SESSION_SIGNING_KEY if not present
    if (!this.secrets.has(SecretKey.SESSION_SIGNING_KEY)) {
      const key = this.generateSecureToken(64);
      this.secrets.set(SecretKey.SESSION_SIGNING_KEY, key);
      logger.info('Generated runtime SESSION_SIGNING_KEY');
    }

    // Generate ENCRYPTION_KEY if not present
    if (!this.secrets.has(SecretKey.ENCRYPTION_KEY)) {
      const key = this.generateSecureToken(64);
      this.secrets.set(SecretKey.ENCRYPTION_KEY, key);
      logger.info('Generated runtime ENCRYPTION_KEY');
    }

    // Generate JWT_SECRET if not present (dev mode only)
    if (!this.secrets.has(SecretKey.JWT_SECRET) && process.env.NODE_ENV === 'development') {
      const secret = this.generateSecureToken(64);
      this.secrets.set(SecretKey.JWT_SECRET, secret);
      logger.warn('Generated JWT_SECRET for development - use proper secret in production!');
    }
  }

  /**
   * Generate secure random token
   */
  private generateSecureToken(length: number): string {
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Check if key is sensitive
   */
  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      SecretKey.JWT_SECRET,
      SecretKey.JWT_SECRET_PREVIOUS,
      SecretKey.SESSION_SIGNING_KEY,
      SecretKey.ENCRYPTION_KEY,
      SecretKey.MYSQL_PASSWORD,
      SecretKey.REDIS_PASSWORD,
      SecretKey.DISCORD_TOKEN,
      SecretKey.DISCORD_CLIENT_SECRET,
      SecretKey.SMTP_PASSWORD
    ];

    return sensitiveKeys.includes(key as SecretKey);
  }

  /**
   * Check if secret is critical
   */
  private isCriticalSecret(key: string): boolean {
    const criticalKeys = [
      SecretKey.JWT_SECRET,
      SecretKey.ENCRYPTION_KEY,
      SecretKey.DISCORD_TOKEN
    ];

    return criticalKeys.includes(key as SecretKey);
  }

  /**
   * Get default rotation schedule for key
   */
  private getDefaultRotationSchedule(key: string): number | null {
    // JWT and session keys: rotate every 30 days
    if ([SecretKey.JWT_SECRET, SecretKey.SESSION_SIGNING_KEY].includes(key as SecretKey)) {
      return 30;
    }

    // Gateway keys: rotate every 90 days
    if ([
      SecretKey.MIDTRANS_SERVER_KEY,
      SecretKey.DUITKU_API_KEY,
      SecretKey.TRIPAY_API_KEY,
      SecretKey.XENDIT_API_KEY,
      SecretKey.CRYPTOMUS_API_KEY
    ].includes(key as SecretKey)) {
      return 90;
    }

    return null;
  }

  /**
   * Get secrets requiring rotation
   */
  getSecretsRequiringRotation(): SecretMetadata[] {
    const now = new Date();
    const requiring: SecretMetadata[] = [];

    for (const [key, meta] of this.metadata.entries()) {
      if (!meta.rotationSchedule || !meta.lastRotated) {
        continue;
      }

      const daysSinceRotation = Math.floor(
        (now.getTime() - meta.lastRotated.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceRotation >= meta.rotationSchedule) {
        requiring.push(meta);
      }
    }

    return requiring;
  }

  /**
   * Export secrets to environment file (for rotation)
   */
  exportToEnvFile(filePath: string): void {
    const lines: string[] = [];

    for (const [key, value] of this.secrets.entries()) {
      // Skip runtime-generated secrets
      if ([
        SecretKey.DASHBOARD_IPC_TOKEN,
        SecretKey.SESSION_SIGNING_KEY,
        SecretKey.ENCRYPTION_KEY
      ].includes(key as SecretKey)) {
        continue;
      }

      lines.push(`${key}=${value}`);
    }

    fs.writeFileSync(filePath, lines.join('\n'), { mode: 0o600 });
    logger.info(`Secrets exported to: ${filePath}`);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalSecrets: this.secrets.size,
      sensitiveSecrets: Array.from(this.metadata.values()).filter(m => m.isSensitive).length,
      scheduledForRotation: Array.from(this.metadata.values()).filter(m => m.rotationSchedule).length,
      requireRotation: this.getSecretsRequiringRotation().length,
      loaded: this.loaded
    };
  }
}

// Singleton instance
let secretManager: SecretManager | null = null;

export function getSecretManager(): SecretManager {
  if (!secretManager) {
    secretManager = new SecretManager();
    secretManager.loadSecrets();
  }

  return secretManager;
}

export function createSecretManager(): SecretManager {
  return new SecretManager();
}
