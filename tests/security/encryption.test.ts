import { describe, it, expect, beforeEach } from 'vitest';
import { EncryptionService } from '../../src/core/security/encryption';

describe('EncryptionService', () => {
  let encryption: EncryptionService;

  beforeEach(() => {
    encryption = new EncryptionService();
  });

  it('should encrypt and decrypt data correctly', () => {
    const plaintext = 'sensitive data';
    const encrypted = encryption.encryptData(plaintext);
    const decrypted = encryption.decryptData(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('should encrypt and decrypt objects correctly', () => {
    const obj = { userId: '123', email: 'test@example.com' };
    const encrypted = encryption.encryptObject(obj);
    const decrypted = encryption.decryptObject(encrypted);

    expect(decrypted).toEqual(obj);
  });

  it('should hash passwords with salt', () => {
    const password = 'testpassword123';
    const hash = encryption.hashPassword(password);

    expect(hash).toContain(':');
    expect(hash.split(':').length).toBe(2);
  });

  it('should verify correct password', () => {
    const password = 'testpassword123';
    const hash = encryption.hashPassword(password);
    const isValid = encryption.verifyPassword(password, hash);

    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', () => {
    const password = 'testpassword123';
    const hash = encryption.hashPassword(password);
    const isValid = encryption.verifyPassword('wrongpassword', hash);

    expect(isValid).toBe(false);
  });

  it('should generate unique tokens', () => {
    const token1 = encryption.generateToken(32);
    const token2 = encryption.generateToken(32);

    expect(token1).not.toBe(token2);
    expect(token1.length).toBeGreaterThan(0);
  });

  it('should sign and verify data', () => {
    const data = 'test data';
    const signature = encryption.sign(data);
    const isValid = encryption.verify(data, signature);

    expect(isValid).toBe(true);
  });

  it('should detect tampered data', () => {
    const data = 'test data';
    const signature = encryption.sign(data);
    const isValid = encryption.verify('tampered data', signature);

    expect(isValid).toBe(false);
  });
});
