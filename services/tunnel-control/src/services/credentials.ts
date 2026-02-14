import crypto from 'crypto';
import { readFile, writeFile, mkdir, unlink, access, constants } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { Config } from '../config/index.js';

interface CredentialsData {
  apiToken: string;
  accountId: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

interface EncryptedCredentials {
  encrypted: true;
  iv: string;
  authTag: string;
  data: string;
}

let config: Config;

export function initCredentials(cfg: Config): void {
  config = cfg;
}

export async function saveCredentials(accountId: string, data: CredentialsData): Promise<void> {
  const credentialsDir = path.join(config.credentialsDir, 'accounts');

  if (!existsSync(credentialsDir)) {
    await mkdir(credentialsDir, { recursive: true, mode: 0o700 });
  }

  const filePath = path.join(credentialsDir, `${accountId}.json`);

  const dataToSave = {
    ...data,
    updatedAt: new Date().toISOString(),
  };

  let content: string;

  if (config.masterKey) {
    const encrypted = encryptCredentials(dataToSave, config.masterKey);
    content = JSON.stringify(encrypted, null, 2);
  } else {
    content = JSON.stringify(dataToSave, null, 2);
  }

  await writeFile(filePath, content, { mode: 0o600 });
}

export async function loadCredentials(accountId: string): Promise<CredentialsData | null> {
  const credentialsDir = path.join(config.credentialsDir, 'accounts');
  const filePath = path.join(credentialsDir, `${accountId}.json`);

  try {
    await access(filePath, constants.R_OK);
  } catch {
    return null;
  }

  const content = await readFile(filePath, 'utf-8');
  const data = JSON.parse(content);

  if (data.encrypted) {
    if (!config.masterKey) {
      throw new Error('Cannot decrypt credentials: MASTER_KEY not set');
    }
    return decryptCredentials(data as EncryptedCredentials, config.masterKey);
  }

  return data as CredentialsData;
}

export async function deleteCredentials(accountId: string): Promise<void> {
  const credentialsDir = path.join(config.credentialsDir, 'accounts');
  const filePath = path.join(credentialsDir, `${accountId}.json`);

  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function listStoredAccounts(): Promise<string[]> {
  const credentialsDir = path.join(config.credentialsDir, 'accounts');

  if (!existsSync(credentialsDir)) {
    return [];
  }

  const { readdir } = await import('fs/promises');
  const entries = await readdir(credentialsDir);

  return entries
    .filter((f: string) => f.endsWith('.json'))
    .map((f: string) => f.replace('.json', ''));
}

export async function getDefaultAccount(): Promise<CredentialsData | null> {
  const accounts = await listStoredAccounts();
  if (accounts.length === 0) {
    return null;
  }
  return loadCredentials(accounts[0]);
}

function normalizeMasterKey(key: string): Buffer {
  if (!key || key.trim().length < 16) {
    throw new Error('MASTER_KEY must be at least 16 characters');
  }
  return crypto.createHash('sha256').update(key, 'utf8').digest();
}

export function encryptCredentials(data: CredentialsData, key: string): EncryptedCredentials {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', normalizeMasterKey(key), iv);

  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encrypted: true,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
    data: encrypted,
  };
}

export function decryptCredentials(encrypted: EncryptedCredentials, key: string): CredentialsData {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    normalizeMasterKey(key),
    Buffer.from(encrypted.iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));

  let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}
