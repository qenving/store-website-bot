import { Request } from 'express';
import { createLogger } from '../logging/logger';
import { dal } from '../db/dal';

const logger = createLogger({ module: 'IPAllowlist' });

export interface IPAllowlistEntry {
  userId: string;
  ip: string;
  description?: string;
  createdAt: Date;
  enabled: boolean;
}

/**
 * IP Allowlist Service
 * Manages IP-based access control for admin users
 */
export class IPAllowlistService {
  /**
   * Check if IP is allowed for user
   */
  async isIPAllowed(userId: string, ip: string): Promise<boolean> {
    try {
      // Get user's allowlist
      const allowlist = await this.getUserAllowlist(userId);

      // If no allowlist configured, allow all
      if (allowlist.length === 0) {
        return true;
      }

      // Check if IP is in allowlist
      const allowed = allowlist.some(entry =>
        entry.enabled && this.matchIP(ip, entry.ip)
      );

      if (!allowed) {
        logger.warn('IP not in allowlist', { userId, ip });
      }

      return allowed;
    } catch (error) {
      logger.error('Failed to check IP allowlist', error);
      // On error, allow (fail open)
      return true;
    }
  }

  /**
   * Add IP to user's allowlist
   */
  async addIP(userId: string, ip: string, description?: string): Promise<void> {
    try {
      await dal.execute(
        `INSERT INTO ip_allowlist
        (userId, ip, description, createdAt, enabled)
        VALUES (?, ?, ?, ?, ?)`,
        [userId, ip, description || null, new Date(), true]
      );

      logger.info('IP added to allowlist', { userId, ip });
    } catch (error) {
      logger.error('Failed to add IP to allowlist', error);
      throw error;
    }
  }

  /**
   * Remove IP from user's allowlist
   */
  async removeIP(userId: string, ip: string): Promise<void> {
    try {
      await dal.execute(
        'DELETE FROM ip_allowlist WHERE userId = ? AND ip = ?',
        [userId, ip]
      );

      logger.info('IP removed from allowlist', { userId, ip });
    } catch (error) {
      logger.error('Failed to remove IP from allowlist', error);
      throw error;
    }
  }

  /**
   * Enable/disable IP in allowlist
   */
  async toggleIP(userId: string, ip: string, enabled: boolean): Promise<void> {
    try {
      await dal.execute(
        'UPDATE ip_allowlist SET enabled = ? WHERE userId = ? AND ip = ?',
        [enabled, userId, ip]
      );

      logger.info('IP allowlist entry toggled', { userId, ip, enabled });
    } catch (error) {
      logger.error('Failed to toggle IP allowlist entry', error);
      throw error;
    }
  }

  /**
   * Get user's allowlist
   */
  async getUserAllowlist(userId: string): Promise<IPAllowlistEntry[]> {
    try {
      const rows = await dal.query<any>(
        'SELECT * FROM ip_allowlist WHERE userId = ? ORDER BY createdAt DESC',
        [userId]
      );

      return rows.map(row => ({
        userId: row.userId,
        ip: row.ip,
        description: row.description,
        createdAt: new Date(row.createdAt),
        enabled: Boolean(row.enabled)
      }));
    } catch (error) {
      logger.error('Failed to get user allowlist', error);
      return [];
    }
  }

  /**
   * Clear user's allowlist
   */
  async clearUserAllowlist(userId: string): Promise<void> {
    try {
      await dal.execute(
        'DELETE FROM ip_allowlist WHERE userId = ?',
        [userId]
      );

      logger.info('User allowlist cleared', { userId });
    } catch (error) {
      logger.error('Failed to clear user allowlist', error);
      throw error;
    }
  }

  /**
   * Get client IP from request
   */
  getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];

    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }

    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  /**
   * Match IP against pattern (supports wildcards)
   */
  private matchIP(ip: string, pattern: string): boolean {
    // Exact match
    if (ip === pattern) {
      return true;
    }

    // Wildcard match (e.g., 192.168.1.*)
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');

      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(ip);
    }

    // CIDR notation (basic support)
    if (pattern.includes('/')) {
      return this.matchCIDR(ip, pattern);
    }

    return false;
  }

  /**
   * Match IP against CIDR notation (basic implementation)
   */
  private matchCIDR(ip: string, cidr: string): boolean {
    const [range, bits] = cidr.split('/');
    const mask = parseInt(bits, 10);

    if (isNaN(mask) || mask < 0 || mask > 32) {
      return false;
    }

    const ipNum = this.ipToNumber(ip);
    const rangeNum = this.ipToNumber(range);
    const maskNum = (0xffffffff << (32 - mask)) >>> 0;

    return (ipNum & maskNum) === (rangeNum & maskNum);
  }

  /**
   * Convert IP to number
   */
  private ipToNumber(ip: string): number {
    const parts = ip.split('.');

    if (parts.length !== 4) {
      return 0;
    }

    return parts.reduce((acc, part, index) => {
      return acc + (parseInt(part, 10) << (8 * (3 - index)));
    }, 0) >>> 0;
  }

  /**
   * Validate IP address format
   */
  validateIP(ip: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;

    if (!ipv4Regex.test(ip)) {
      return false;
    }

    const parts = ip.split('.').map(Number);

    return parts.every(part => part >= 0 && part <= 255);
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalUsers: number;
    totalIPs: number;
    enabledIPs: number;
  }> {
    try {
      const [usersResult, ipsResult, enabledResult] = await Promise.all([
        dal.query<any>('SELECT COUNT(DISTINCT userId) as count FROM ip_allowlist'),
        dal.query<any>('SELECT COUNT(*) as count FROM ip_allowlist'),
        dal.query<any>('SELECT COUNT(*) as count FROM ip_allowlist WHERE enabled = true')
      ]);

      return {
        totalUsers: usersResult[0]?.count || 0,
        totalIPs: ipsResult[0]?.count || 0,
        enabledIPs: enabledResult[0]?.count || 0
      };
    } catch (error) {
      logger.error('Failed to get IP allowlist stats', error);
      return {
        totalUsers: 0,
        totalIPs: 0,
        enabledIPs: 0
      };
    }
  }
}

// Singleton instance
let ipAllowlistService: IPAllowlistService | null = null;

export function getIPAllowlistService(): IPAllowlistService {
  if (!ipAllowlistService) {
    ipAllowlistService = new IPAllowlistService();
  }

  return ipAllowlistService;
}

export function createIPAllowlistService(): IPAllowlistService {
  return new IPAllowlistService();
}
