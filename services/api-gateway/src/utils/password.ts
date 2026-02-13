import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type * as Argon2Module from 'argon2';

const SCRYPT_PREFIX = '$scrypt$';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;

export interface PasswordHashOptions {
  memoryCost?: number;
  timeCost?: number;
  parallelism?: number;
  hashLength?: number;
  saltLength?: number;
}

export interface PasswordVerificationResult {
  valid: boolean;
  backendUnavailable: boolean;
  reason?: string;
}

export interface PasswordBackendStatus {
  preferred: 'argon2';
  active: 'argon2' | 'scrypt-fallback';
  degraded: boolean;
  reason?: string;
}

// Secure default configuration for Argon2id
const DEFAULT_OPTIONS: Required<PasswordHashOptions> = {
  memoryCost: process.env.ARGON2_MEMORY_COST ? parseInt(process.env.ARGON2_MEMORY_COST, 10) : 19456,
  timeCost: process.env.ARGON2_TIME_COST ? parseInt(process.env.ARGON2_TIME_COST, 10) : 2,
  parallelism: process.env.ARGON2_PARALLELISM ? parseInt(process.env.ARGON2_PARALLELISM, 10) : 1,
  hashLength: 32, // 32 bytes output
  saltLength: 16, // 16 bytes salt
};

let warnedArgon2Fallback = false;
let cachedArgon2: typeof Argon2Module | null | undefined;
let argon2UnavailableReason: string | undefined;

function warnArgon2Fallback(reason: string): void {
  if (warnedArgon2Fallback) return;
  warnedArgon2Fallback = true;
  argon2UnavailableReason = reason;
  console.warn(`[auth] argon2 unavailable (${reason}), falling back to scrypt`);
}

async function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey as Buffer);
    });
  });
}

async function loadArgon2(): Promise<typeof Argon2Module | null> {
  if (cachedArgon2 !== undefined) {
    return cachedArgon2;
  }

  try {
    cachedArgon2 = await import('argon2');
    argon2UnavailableReason = undefined;
    return cachedArgon2;
  } catch (error) {
    cachedArgon2 = null;
    warnArgon2Fallback((error as Error).message);
    return null;
  }
}

async function hashWithScrypt(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return `${SCRYPT_PREFIX}${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

function isArgon2Hash(hash: string): boolean {
  return hash.startsWith('$argon2');
}

function isScryptHash(hash: string): boolean {
  return hash.startsWith(SCRYPT_PREFIX);
}

async function verifyScryptHash(password: string, hash: string): Promise<boolean> {
  const parts = hash.split('$');
  if (parts.length !== 7 || parts[1] !== 'scrypt') {
    return false;
  }

  const N = parseInt(parts[2], 10);
  const r = parseInt(parts[3], 10);
  const p = parseInt(parts[4], 10);
  const salt = Buffer.from(parts[5], 'base64');
  const expected = Buffer.from(parts[6], 'base64');

  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || expected.length === 0) {
    return false;
  }

  const actual = await scryptAsync(password, salt, expected.length, { N, r, p });
  return timingSafeEqual(actual, expected);
}

export async function getPasswordBackendStatus(): Promise<PasswordBackendStatus> {
  const argon2 = await loadArgon2();
  if (argon2) {
    return {
      preferred: 'argon2',
      active: 'argon2',
      degraded: false,
    };
  }

  return {
    preferred: 'argon2',
    active: 'scrypt-fallback',
    degraded: true,
    reason: argon2UnavailableReason || 'argon2 module unavailable',
  };
}

/**
 * Hash a password using Argon2id
 * @param password - Plain text password to hash
 * @param options - Optional configuration for Argon2
 * @returns Promise resolving to the hashed password
 */
export async function hashPassword(
  password: string,
  options: PasswordHashOptions = {}
): Promise<string> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const argon2 = await loadArgon2();

  if (argon2) {
    try {
      return await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: config.memoryCost,
        timeCost: config.timeCost,
        parallelism: config.parallelism,
      });
    } catch (error) {
      warnArgon2Fallback((error as Error).message);
    }
  }

  try {
    return await hashWithScrypt(password);
  } catch (fallbackError) {
    throw new Error(`Failed to hash password: ${(fallbackError as Error).message}`);
  }
}

/**
 * Verify a password against a hash
 * @param password - Plain text password to verify
 * @param hash - Hash to verify against
 * @returns Promise resolving to true if password matches, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const result = await verifyPasswordWithStatus(password, hash);
  return result.valid;
}

export async function verifyPasswordWithStatus(
  password: string,
  hash: string
): Promise<PasswordVerificationResult> {
  if (isScryptHash(hash)) {
    try {
      return {
        valid: await verifyScryptHash(password, hash),
        backendUnavailable: false,
      };
    } catch {
      return {
        valid: false,
        backendUnavailable: false,
      };
    }
  }

  const argon2 = await loadArgon2();
  if (!argon2) {
    return {
      valid: false,
      backendUnavailable: isArgon2Hash(hash),
      reason: isArgon2Hash(hash)
        ? argon2UnavailableReason || 'argon2 backend unavailable for stored hash'
        : undefined,
    };
  }

  try {
    return {
      valid: await argon2.verify(hash, password),
      backendUnavailable: false,
    };
  } catch {
    return {
      valid: false,
      backendUnavailable: false,
    };
  }
}

/**
 * Verify a password and rehash if needed
 * Useful when upgrading Argon2 parameters
 * @param password - Plain text password
 * @param hash - Current hash
 * @param options - New hashing options
 * @returns Object with valid flag and newHash if rehashing was needed
 */
export async function verifyAndRehash(
  password: string,
  hash: string,
  options: PasswordHashOptions = {}
): Promise<{ valid: boolean; newHash?: string }> {
  const verification = await verifyPasswordWithStatus(password, hash);
  const valid = verification.valid;

  if (!valid) {
    return { valid: false };
  }

  if (isScryptHash(hash)) {
    const newHash = await hashPassword(password, options);
    return { valid: true, newHash };
  }

  const argon2 = await loadArgon2();
  if (!argon2) {
    const newHash = await hashWithScrypt(password);
    return { valid: true, newHash };
  }

  // Check if rehashing is needed
  const needsRehash = argon2.needsRehash(hash, {
    type: argon2.argon2id,
    memoryCost: DEFAULT_OPTIONS.memoryCost,
    timeCost: DEFAULT_OPTIONS.timeCost,
    parallelism: DEFAULT_OPTIONS.parallelism,
  });

  if (needsRehash) {
    const newHash = await hashPassword(password, options);
    return { valid: true, newHash };
  }

  return { valid: true };
}

/**
 * Generate a secure random password
 * @param length - Length of the password (default: 16)
 * @returns Random password string
 */
export function generateRandomPassword(length = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length];
  }

  return password;
}

/**
 * Validate password strength
 * @param password - Password to validate
 * @returns Object with isValid flag and array of error messages
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  errors: string[];
  score: number;
} {
  const errors: string[] = [];
  let score = 0;

  // Length check
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  } else if (password.length >= 12) {
    score += 2;
  } else {
    score += 1;
  }

  // Uppercase check
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  } else {
    score += 1;
  }

  // Lowercase check
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  } else {
    score += 1;
  }

  // Number check
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  } else {
    score += 1;
  }

  // Special character check
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  } else {
    score += 1;
  }

  return {
    isValid: errors.length === 0,
    errors,
    score,
  };
}

/**
 * Check if a password has been compromised using haveibeenpwned API
 * Note: This requires network access and should be used sparingly
 * @param password - Password to check
 * @returns Promise resolving to true if password is compromised
 */
export async function isPasswordCompromised(password: string): Promise<boolean> {
  // This is a placeholder - in production, you might want to implement
  // the k-anonymity API from haveibeenpwned.com
  // For now, just check against common passwords
  const commonPasswords = [
    'password',
    '123456',
    '12345678',
    'qwerty',
    'abc123',
    'password123',
    'admin',
    'letmein',
    'welcome',
    'monkey',
  ];

  return commonPasswords.includes(password.toLowerCase());
}

/**
 * Get current Argon2 configuration
 * @returns Current configuration object
 */
export function getArgon2Config(): Required<PasswordHashOptions> {
  return { ...DEFAULT_OPTIONS };
}
