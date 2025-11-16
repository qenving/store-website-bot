import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../logging/logger';
import { getRequestValidator, ValidationResult } from './requestValidator';
import { dal } from '../db/dal';

const logger = createLogger({ module: 'WAFGuard' });

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PARAM_LENGTH = 1000;

const SUSPICIOUS_USER_AGENTS = [
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /nessus/i,
  /burp/i,
  /acunetix/i,
  /w3af/i,
  /metasploit/i
];

export interface WAFConfig {
  enableXSSProtection?: boolean;
  enableSQLInjectionProtection?: boolean;
  enablePathTraversalProtection?: boolean;
  enableBodySizeLimit?: boolean;
  enableUserAgentCheck?: boolean;
  logAllBlocks?: boolean;
  blockOnSuspicion?: boolean;
}

const DEFAULT_CONFIG: WAFConfig = {
  enableXSSProtection: true,
  enableSQLInjectionProtection: true,
  enablePathTraversalProtection: true,
  enableBodySizeLimit: true,
  enableUserAgentCheck: true,
  logAllBlocks: true,
  blockOnSuspicion: true
};

/**
 * WAF Guard - Web Application Firewall
 * Protects against common web attacks
 */
export class WAFGuard {
  private validator = getRequestValidator();
  private config: WAFConfig;

  constructor(config: WAFConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create WAF middleware
   */
  createMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Check user agent
        if (this.config.enableUserAgentCheck) {
          const uaCheck = this.checkUserAgent(req);
          if (!uaCheck.valid) {
            await this.logBlock(req, uaCheck);
            if (this.config.blockOnSuspicion) {
              return this.blockRequest(res, uaCheck);
            }
          }
        }

        // Check body size
        if (this.config.enableBodySizeLimit) {
          const sizeCheck = this.checkBodySize(req);
          if (!sizeCheck.valid) {
            await this.logBlock(req, sizeCheck);
            return this.blockRequest(res, sizeCheck);
          }
        }

        // Validate request parameters
        const paramCheck = this.validateParameters(req);
        if (!paramCheck.valid) {
          await this.logBlock(req, paramCheck);
          if (this.config.blockOnSuspicion) {
            return this.blockRequest(res, paramCheck);
          }
        }

        // Validate request body
        if (req.body && Object.keys(req.body).length > 0) {
          const bodyCheck = this.validateBody(req);
          if (!bodyCheck.valid) {
            await this.logBlock(req, bodyCheck);
            if (this.config.blockOnSuspicion) {
              return this.blockRequest(res, bodyCheck);
            }
          }
        }

        // Validate JSON structure (prevent prototype pollution)
        if (req.body) {
          const objCheck = this.validator.validateObjectKeys(req.body);
          if (!objCheck.valid) {
            await this.logBlock(req, objCheck);
            return this.blockRequest(res, objCheck);
          }
        }

        next();
      } catch (error) {
        logger.error('WAF error', error);
        next(); // Allow through on error
      }
    };
  }

  /**
   * Check user agent for suspicious patterns
   */
  private checkUserAgent(req: Request): ValidationResult {
    const userAgent = req.headers['user-agent'] || '';

    for (const pattern of SUSPICIOUS_USER_AGENTS) {
      if (pattern.test(userAgent)) {
        return {
          valid: false,
          reason: 'Suspicious user agent detected',
          severity: 'high'
        };
      }
    }

    return { valid: true };
  }

  /**
   * Check body size
   */
  private checkBodySize(req: Request): ValidationResult {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);

    if (contentLength > MAX_BODY_SIZE) {
      return {
        valid: false,
        reason: `Body size exceeds maximum (${MAX_BODY_SIZE} bytes)`,
        severity: 'medium'
      };
    }

    return { valid: true };
  }

  /**
   * Validate request parameters
   */
  private validateParameters(req: Request): ValidationResult {
    // Check query parameters
    for (const [key, value] of Object.entries(req.query)) {
      const strValue = String(value);

      // Check length
      if (strValue.length > MAX_PARAM_LENGTH) {
        return {
          valid: false,
          reason: `Parameter '${key}' exceeds maximum length`,
          severity: 'medium'
        };
      }

      // Validate input
      const result = this.validateValue(strValue);
      if (!result.valid) {
        return {
          ...result,
          reason: `Parameter '${key}': ${result.reason}`
        };
      }
    }

    // Check path parameters
    for (const [key, value] of Object.entries(req.params)) {
      const result = this.validateValue(value);
      if (!result.valid) {
        return {
          ...result,
          reason: `Path parameter '${key}': ${result.reason}`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate request body
   */
  private validateBody(req: Request): ValidationResult {
    if (typeof req.body === 'string') {
      return this.validateValue(req.body);
    }

    if (typeof req.body === 'object') {
      return this.validateObject(req.body);
    }

    return { valid: true };
  }

  /**
   * Validate object recursively
   */
  private validateObject(obj: any): ValidationResult {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        const result = this.validateValue(value);
        if (!result.valid) {
          return {
            ...result,
            reason: `Field '${key}': ${result.reason}`
          };
        }
      } else if (typeof value === 'object' && value !== null) {
        const result = this.validateObject(value);
        if (!result.valid) {
          return result;
        }
      }
    }

    return { valid: true };
  }

  /**
   * Validate single value
   */
  private validateValue(value: string): ValidationResult {
    if (this.config.enableXSSProtection) {
      const xssResult = this.validator.validateXSS(value);
      if (!xssResult.valid) return xssResult;
    }

    if (this.config.enableSQLInjectionProtection) {
      const sqlResult = this.validator.validateSQLInjection(value);
      if (!sqlResult.valid) return sqlResult;
    }

    if (this.config.enablePathTraversalProtection) {
      const pathResult = this.validator.validatePathTraversal(value);
      if (!pathResult.valid) return pathResult;
    }

    return { valid: true };
  }

  /**
   * Log blocked request
   */
  private async logBlock(req: Request, result: ValidationResult): Promise<void> {
    if (!this.config.logAllBlocks) {
      return;
    }

    const ip = this.getClientIp(req);

    logger.warn('WAF blocked request', {
      reason: result.reason,
      severity: result.severity,
      ip,
      path: req.path,
      method: req.method
    });

    // Save to security logs
    try {
      await dal.execute(
        `INSERT INTO security_logs
        (type, severity, message, metadata, createdAt)
        VALUES (?, ?, ?, ?, ?)`,
        [
          'waf_block',
          result.severity || 'medium',
          result.reason || 'WAF block',
          JSON.stringify({
            ip,
            path: req.path,
            method: req.method,
            userAgent: req.headers['user-agent'],
            query: req.query,
            body: typeof req.body === 'object' ? '[REDACTED]' : req.body?.substring(0, 100)
          }),
          new Date()
        ]
      );
    } catch (error) {
      logger.error('Failed to log WAF block', error);
    }
  }

  /**
   * Block request
   */
  private blockRequest(res: Response, result: ValidationResult): Response {
    const statusCode = result.severity === 'critical' ? 403 : 400;

    return res.status(statusCode).json({
      success: false,
      error: {
        code: 'REQUEST_BLOCKED',
        message: 'Request blocked by security filter'
      }
    });
  }

  /**
   * Get client IP
   */
  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];

    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }

    return req.ip || req.socket.remoteAddress || 'unknown';
  }
}

// Singleton instance
let wafGuard: WAFGuard | null = null;

export function getWAFGuard(config?: WAFConfig): WAFGuard {
  if (!wafGuard) {
    wafGuard = new WAFGuard(config);
  }

  return wafGuard;
}

export function createWAFGuard(config?: WAFConfig): WAFGuard {
  return new WAFGuard(config);
}
