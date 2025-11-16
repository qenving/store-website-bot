import { createLogger } from '../logging/logger';

const logger = createLogger({ module: 'RequestValidator' });

// XSS patterns
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi,
  /eval\(/gi,
  /expression\(/gi
];

// SQL injection patterns
const SQL_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
  /(UNION\s+SELECT)/gi,
  /(\bOR\b\s+\d+\s*=\s*\d+)/gi,
  /(\bAND\b\s+\d+\s*=\s*\d+)/gi,
  /(--|#|\/\*|\*\/)/g,
  /(;|\||&&)/g
];

// Path traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//g,
  /\.\.%2[fF]/g,
  /%2e%2e/gi
];

// Command injection patterns
const COMMAND_INJECTION_PATTERNS = [
  /[;&|`$()]/g,
  /\$\{/g,
  /\$\(/g
];

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Request Validator for security checks
 */
export class RequestValidator {
  /**
   * Validate input for XSS patterns
   */
  validateXSS(input: string): ValidationResult {
    for (const pattern of XSS_PATTERNS) {
      if (pattern.test(input)) {
        logger.warn('XSS pattern detected', {
          pattern: pattern.source,
          input: input.substring(0, 100)
        });

        return {
          valid: false,
          reason: 'Potential XSS detected',
          severity: 'high'
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate input for SQL injection patterns
   */
  validateSQLInjection(input: string): ValidationResult {
    for (const pattern of SQL_PATTERNS) {
      if (pattern.test(input)) {
        logger.warn('SQL injection pattern detected', {
          pattern: pattern.source,
          input: input.substring(0, 100)
        });

        return {
          valid: false,
          reason: 'Potential SQL injection detected',
          severity: 'critical'
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate input for path traversal
   */
  validatePathTraversal(input: string): ValidationResult {
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(input)) {
        logger.warn('Path traversal pattern detected', {
          pattern: pattern.source,
          input: input.substring(0, 100)
        });

        return {
          valid: false,
          reason: 'Potential path traversal detected',
          severity: 'high'
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate input for command injection
   */
  validateCommandInjection(input: string): ValidationResult {
    for (const pattern of COMMAND_INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        logger.warn('Command injection pattern detected', {
          pattern: pattern.source,
          input: input.substring(0, 100)
        });

        return {
          valid: false,
          reason: 'Potential command injection detected',
          severity: 'critical'
        };
      }
    }

    return { valid: true };
  }

  /**
   * Comprehensive input validation
   */
  validateInput(input: string): ValidationResult {
    // Check XSS
    const xssResult = this.validateXSS(input);
    if (!xssResult.valid) return xssResult;

    // Check SQL injection
    const sqlResult = this.validateSQLInjection(input);
    if (!sqlResult.valid) return sqlResult;

    // Check path traversal
    const pathResult = this.validatePathTraversal(input);
    if (!pathResult.valid) return pathResult;

    // Check command injection
    const cmdResult = this.validateCommandInjection(input);
    if (!cmdResult.valid) return cmdResult;

    return { valid: true };
  }

  /**
   * Sanitize input (basic)
   */
  sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove < and >
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .trim();
  }

  /**
   * Validate email format
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate URL format
   */
  validateURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate UUID format
   */
  validateUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Validate alphanumeric
   */
  validateAlphanumeric(input: string): boolean {
    const alphanumericRegex = /^[a-zA-Z0-9]+$/;
    return alphanumericRegex.test(input);
  }

  /**
   * Validate numeric
   */
  validateNumeric(input: string): boolean {
    const numericRegex = /^[0-9]+$/;
    return numericRegex.test(input);
  }

  /**
   * Validate length
   */
  validateLength(input: string, min: number, max: number): boolean {
    return input.length >= min && input.length <= max;
  }

  /**
   * Validate object keys (prevent prototype pollution)
   */
  validateObjectKeys(obj: any): ValidationResult {
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

    const checkKeys = (o: any): boolean => {
      if (typeof o !== 'object' || o === null) {
        return true;
      }

      for (const key of Object.keys(o)) {
        if (dangerousKeys.includes(key)) {
          return false;
        }

        if (!checkKeys(o[key])) {
          return false;
        }
      }

      return true;
    };

    if (!checkKeys(obj)) {
      logger.warn('Dangerous object keys detected (prototype pollution attempt)');

      return {
        valid: false,
        reason: 'Invalid object structure',
        severity: 'critical'
      };
    }

    return { valid: true };
  }

  /**
   * Validate JSON
   */
  validateJSON(input: string): { valid: boolean; parsed?: any } {
    try {
      const parsed = JSON.parse(input);
      return { valid: true, parsed };
    } catch {
      return { valid: false };
    }
  }
}

// Singleton instance
let requestValidator: RequestValidator | null = null;

export function getRequestValidator(): RequestValidator {
  if (!requestValidator) {
    requestValidator = new RequestValidator();
  }

  return requestValidator;
}

export function createRequestValidator(): RequestValidator {
  return new RequestValidator();
}
