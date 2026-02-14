import { describe, expect, it } from 'vitest';
import {
  decryptCredentials,
  encryptCredentials,
} from '../../../services/tunnel-control/src/services/credentials.js';

describe('Credentials encryption', () => {
  it('encrypts and decrypts credentials with AES-256-GCM', () => {
    const plain = {
      apiToken: 'cf-token',
      accountId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const encrypted = encryptCredentials(plain, 'this-is-a-very-strong-master-key');
    const decrypted = decryptCredentials(encrypted, 'this-is-a-very-strong-master-key');

    expect(encrypted.encrypted).toBe(true);
    expect(decrypted).toEqual(plain);
  });

  it('fails to decrypt with a different key', () => {
    const plain = {
      apiToken: 'cf-token',
      accountId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const encrypted = encryptCredentials(plain, 'this-is-a-very-strong-master-key');

    expect(() => decryptCredentials(encrypted, 'different-master-key-123')).toThrow();
  });
});
