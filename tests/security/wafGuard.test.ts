import { describe, it, expect } from 'vitest';
import { RequestValidator } from '../../src/core/security/requestValidator';

describe('RequestValidator', () => {
  const validator = new RequestValidator();

  it('should detect XSS patterns', () => {
    const result = validator.validateXSS('<script>alert("xss")</script>');
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('high');
  });

  it('should detect SQL injection patterns', () => {
    const result = validator.validateSQLInjection('SELECT * FROM users WHERE id = 1 OR 1=1');
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('critical');
  });

  it('should detect path traversal', () => {
    const result = validator.validatePathTraversal('../../../etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('high');
  });

  it('should allow safe input', () => {
    const result = validator.validateInput('safe user input');
    expect(result.valid).toBe(true);
  });

  it('should validate email format', () => {
    expect(validator.validateEmail('test@example.com')).toBe(true);
    expect(validator.validateEmail('invalid-email')).toBe(false);
  });

  it('should detect prototype pollution', () => {
    const result = validator.validateObjectKeys({ __proto__: { admin: true } });
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('critical');
  });
});
