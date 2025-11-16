import { Request } from 'express';
import * as crypto from 'crypto';
import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'DeviceFingerprint' });

export interface DeviceFingerprintData {
  fingerprint: string;
  userAgent: string;
  platform?: string;
  language?: string;
  screenResolution?: string;
  timezone?: string;
}

/**
 * Device Fingerprinting Service
 * Creates approximate device fingerprints for tracking
 */
export class DeviceFingerprintService {
  /**
   * Generate device fingerprint from request
   */
  generateFingerprint(req: Request, additionalData?: Record<string, any>): string {
    const components: string[] = [];

    // User agent
    const userAgent = req.headers['user-agent'] || '';
    components.push(userAgent);

    // Accept language
    const language = req.headers['accept-language'] || '';
    components.push(language);

    // Accept encoding
    const encoding = req.headers['accept-encoding'] || '';
    components.push(encoding);

    // Accept
    const accept = req.headers['accept'] || '';
    components.push(accept);

    // Additional data from client
    if (additionalData) {
      if (additionalData.platform) components.push(additionalData.platform);
      if (additionalData.screenResolution) components.push(additionalData.screenResolution);
      if (additionalData.timezone) components.push(additionalData.timezone);
    }

    // Combine and hash
    const combined = components.join('|');
    const fingerprint = crypto
      .createHash('sha256')
      .update(combined)
      .digest('hex')
      .substring(0, 32);

    logger.debug('Device fingerprint generated', {
      fingerprint,
      components: components.length
    });

    return fingerprint;
  }

  /**
   * Generate detailed fingerprint data
   */
  generateDetailedFingerprint(req: Request, additionalData?: Record<string, any>): DeviceFingerprintData {
    const fingerprint = this.generateFingerprint(req, additionalData);

    return {
      fingerprint,
      userAgent: req.headers['user-agent'] || 'unknown',
      platform: additionalData?.platform,
      language: req.headers['accept-language']?.split(',')[0],
      screenResolution: additionalData?.screenResolution,
      timezone: additionalData?.timezone
    };
  }

  /**
   * Extract platform from user agent
   */
  extractPlatform(userAgent: string): string {
    if (/Windows/i.test(userAgent)) return 'Windows';
    if (/Mac OS X/i.test(userAgent)) return 'macOS';
    if (/Linux/i.test(userAgent)) return 'Linux';
    if (/Android/i.test(userAgent)) return 'Android';
    if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';

    return 'Unknown';
  }

  /**
   * Extract browser from user agent
   */
  extractBrowser(userAgent: string): string {
    if (/Chrome/i.test(userAgent) && !/Edg/i.test(userAgent)) return 'Chrome';
    if (/Firefox/i.test(userAgent)) return 'Firefox';
    if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) return 'Safari';
    if (/Edg/i.test(userAgent)) return 'Edge';
    if (/Opera|OPR/i.test(userAgent)) return 'Opera';

    return 'Unknown';
  }

  /**
   * Get human-readable device info
   */
  getDeviceInfo(userAgent: string): {
    platform: string;
    browser: string;
    isMobile: boolean;
  } {
    return {
      platform: this.extractPlatform(userAgent),
      browser: this.extractBrowser(userAgent),
      isMobile: /Mobile|Android|iPhone/i.test(userAgent)
    };
  }

  /**
   * Compare two fingerprints
   */
  compareFingerprints(fp1: string, fp2: string): boolean {
    return fp1 === fp2;
  }

  /**
   * Verify device fingerprint matches
   */
  verifyDevice(req: Request, expectedFingerprint: string, additionalData?: Record<string, any>): boolean {
    const currentFingerprint = this.generateFingerprint(req, additionalData);
    return this.compareFingerprints(currentFingerprint, expectedFingerprint);
  }
}

// Singleton instance
let deviceFingerprintService: DeviceFingerprintService | null = null;

export function getDeviceFingerprintService(): DeviceFingerprintService {
  if (!deviceFingerprintService) {
    deviceFingerprintService = new DeviceFingerprintService();
  }

  return deviceFingerprintService;
}

export function createDeviceFingerprintService(): DeviceFingerprintService {
  return new DeviceFingerprintService();
}
