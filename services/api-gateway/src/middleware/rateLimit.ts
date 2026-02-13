import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserRole } from '@dockpilot/types';
import '../types/fastify.js';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitStore {
  [key: string]: RateLimitEntry;
}

function parseEnvInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

// In-memory store for rate limiting
const store: RateLimitStore = {};

// Cleanup interval reference
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

// Default rate limits by role
const defaultRoleLimits: Record<UserRole, RateLimitConfig> = {
  admin: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000,
    skipSuccessfulRequests: false,
  },
  operator: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 500,
    skipSuccessfulRequests: false,
  },
  viewer: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200,
    skipSuccessfulRequests: false,
  },
};

// Default rate limit for unauthenticated requests
const defaultAnonymousConfig: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 60,
  skipSuccessfulRequests: false,
};

const strictLoginConfig: RateLimitConfig = {
  windowMs: parseEnvInt(process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  maxRequests: parseEnvInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 5),
  skipSuccessfulRequests: false,
};

const setupConfig: RateLimitConfig = {
  windowMs: parseEnvInt(process.env.AUTH_SETUP_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
  maxRequests: parseEnvInt(process.env.AUTH_SETUP_RATE_LIMIT_MAX, 10),
  skipSuccessfulRequests: false,
};

const refreshConfig: RateLimitConfig = {
  windowMs: parseEnvInt(process.env.AUTH_REFRESH_RATE_LIMIT_WINDOW_MS, 5 * 60 * 1000),
  maxRequests: parseEnvInt(process.env.AUTH_REFRESH_RATE_LIMIT_MAX, 30),
  skipSuccessfulRequests: false,
};

const heavyOperationConfig: RateLimitConfig = {
  windowMs: parseEnvInt(process.env.HEAVY_OP_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  maxRequests: parseEnvInt(process.env.HEAVY_OP_RATE_LIMIT_MAX, 10),
  skipSuccessfulRequests: false,
};

/**
 * Generate a key for rate limiting
 */
function generateKey(identifier: string, type: 'ip' | 'user'): string {
  return `${type}:${identifier}`;
}

/**
 * Get rate limit entry from store
 */
function getEntry(key: string): RateLimitEntry | undefined {
  return store[key];
}

/**
 * Set rate limit entry in store
 */
function setEntry(key: string, entry: RateLimitEntry): void {
  store[key] = entry;
}

/**
 * Increment request count for a key
 */
function incrementCount(key: string, windowMs: number): RateLimitEntry {
  const now = Date.now();
  const entry = getEntry(key);

  if (!entry || now > entry.resetTime) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + windowMs,
    };
    setEntry(key, newEntry);
    return newEntry;
  }

  entry.count++;
  return entry;
}

/**
 * Clean up expired entries from store
 */
function cleanupStore(): void {
  const now = Date.now();
  for (const key of Object.keys(store)) {
    if (store[key].resetTime <= now) {
      delete store[key];
    }
  }
}

/**
 * Start cleanup interval
 */
export function startRateLimitCleanup(intervalMs = 60000): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  cleanupInterval = setInterval(cleanupStore, intervalMs);
}

/**
 * Stop cleanup interval
 */
export function stopRateLimitCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Get rate limit headers
 */
function getRateLimitHeaders(entry: RateLimitEntry, maxRequests: number): Record<string, string> {
  const remaining = Math.max(0, maxRequests - entry.count);
  const resetTime = Math.ceil(entry.resetTime / 1000);

  return {
    'X-RateLimit-Limit': maxRequests.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': resetTime.toString(),
  };
}

/**
 * Rate limit middleware factory
 */
export function createRateLimitMiddleware(config?: Partial<RateLimitConfig>) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const role: UserRole | undefined = (request.user as { role?: UserRole })?.role;
    const roleConfig = role ? defaultRoleLimits[role] : defaultAnonymousConfig;

    const finalConfig: RateLimitConfig = {
      ...roleConfig,
      ...config,
    };

    // Generate key based on user ID or IP
    const identifier = (request.user as { id?: string })?.id || request.ip;
    const key = generateKey(identifier, request.user ? 'user' : 'ip');

    const entry = incrementCount(key, finalConfig.windowMs);
    const headers = getRateLimitHeaders(entry, finalConfig.maxRequests);

    // Set rate limit headers
    for (const [header, value] of Object.entries(headers)) {
      void reply.header(header, value);
    }

    // Check if limit exceeded
    if (entry.count > finalConfig.maxRequests) {
      reply.status(429).send({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil((entry.resetTime - Date.now()) / 1000),
        },
      });
      return;
    }

    // Store entry reference for post-response handling
    (request as unknown as Record<string, unknown>).rateLimitEntry = entry;
    (request as unknown as Record<string, unknown>).rateLimitMax = finalConfig.maxRequests;
  };
}

/**
 * Rate limit middleware with differentiated limits by role
 */
export async function rateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const role: UserRole | undefined = (request.user as { role?: UserRole })?.role;
  const config = role ? defaultRoleLimits[role] : defaultAnonymousConfig;

  // Generate key based on user ID or IP
  const identifier = (request.user as { id?: string })?.id || request.ip;
  const key = generateKey(identifier, request.user ? 'user' : 'ip');

  const entry = incrementCount(key, config.windowMs);
  const headers = getRateLimitHeaders(entry, config.maxRequests);

  // Set rate limit headers
  for (const [header, value] of Object.entries(headers)) {
    void reply.header(header, value);
  }

  // Check if limit exceeded
  if (entry.count > config.maxRequests) {
    reply.status(429).send({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((entry.resetTime - Date.now()) / 1000),
      },
    });
    return;
  }
}

/**
 * Strict rate limit for sensitive endpoints (login, password reset)
 */
export async function strictRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const username =
    typeof (request.body as { username?: unknown } | undefined)?.username === 'string'
      ? ((request.body as { username?: string }).username || '').toLowerCase().trim()
      : '';

  const perIpEntry = incrementCount(generateKey(request.ip, 'ip'), strictLoginConfig.windowMs);
  const compositeKey = username ? `${request.ip}:${username}` : request.ip;
  const perIdentityEntry = incrementCount(
    generateKey(compositeKey, 'ip'),
    strictLoginConfig.windowMs
  );

  const counted = Math.max(perIpEntry.count, perIdentityEntry.count);
  const resetTime = Math.max(perIpEntry.resetTime, perIdentityEntry.resetTime);
  const entry: RateLimitEntry = { count: counted, resetTime };
  const headers = getRateLimitHeaders(entry, strictLoginConfig.maxRequests);

  // Set rate limit headers
  for (const [header, value] of Object.entries(headers)) {
    void reply.header(header, value);
  }

  // Check if limit exceeded
  if (entry.count > strictLoginConfig.maxRequests) {
    reply.status(429).send({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many login attempts. Please try again later.',
        retryAfter: Math.ceil((entry.resetTime - Date.now()) / 1000),
      },
    });
    return;
  }
}

export async function setupRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const entry = incrementCount(generateKey(request.ip, 'ip'), setupConfig.windowMs);
  const headers = getRateLimitHeaders(entry, setupConfig.maxRequests);

  for (const [header, value] of Object.entries(headers)) {
    void reply.header(header, value);
  }

  if (entry.count > setupConfig.maxRequests) {
    reply.status(429).send({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many setup attempts. Please try again later.',
        retryAfter: Math.ceil((entry.resetTime - Date.now()) / 1000),
      },
    });
    return;
  }
}

export async function refreshRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const identifier = (request.user as { id?: string } | undefined)?.id || request.ip;
  const keyType = request.user ? 'user' : 'ip';
  const entry = incrementCount(generateKey(identifier, keyType), refreshConfig.windowMs);
  const headers = getRateLimitHeaders(entry, refreshConfig.maxRequests);

  for (const [header, value] of Object.entries(headers)) {
    void reply.header(header, value);
  }

  if (entry.count > refreshConfig.maxRequests) {
    reply.status(429).send({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many token refresh attempts. Please try again later.',
        retryAfter: Math.ceil((entry.resetTime - Date.now()) / 1000),
      },
    });
    return;
  }
}

export async function heavyOperationRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const method = request.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return;
  }

  const url = request.url.split('?')[0];
  const heavyPrefixes = ['/api/builds', '/api/compose', '/api/tunnels', '/api/images/pull'];
  if (!heavyPrefixes.some((prefix) => url.startsWith(prefix))) {
    return;
  }

  const identifier = (request.user as { id?: string } | undefined)?.id || request.ip;
  const keyType = request.user ? 'user' : 'ip';
  const entry = incrementCount(generateKey(identifier, keyType), heavyOperationConfig.windowMs);
  const headers = getRateLimitHeaders(entry, heavyOperationConfig.maxRequests);

  for (const [header, value] of Object.entries(headers)) {
    void reply.header(header, value);
  }

  if (entry.count > heavyOperationConfig.maxRequests) {
    reply.status(429).send({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Heavy operation rate limit exceeded. Please retry shortly.',
        retryAfter: Math.ceil((entry.resetTime - Date.now()) / 1000),
      },
    });
    return;
  }
}

/**
 * Get current rate limit status for an identifier
 */
export function getRateLimitStatus(
  identifier: string,
  type: 'ip' | 'user' = 'ip'
): { count: number; remaining: number; resetTime: number } | null {
  const key = generateKey(identifier, type);
  const entry = getEntry(key);

  if (!entry) {
    return null;
  }

  const now = Date.now();
  if (now > entry.resetTime) {
    return null;
  }

  return {
    count: entry.count,
    remaining: Math.max(0, 1000 - entry.count), // Default max for status check
    resetTime: entry.resetTime,
  };
}

/**
 * Reset rate limit for an identifier
 */
export function resetRateLimit(identifier: string, type: 'ip' | 'user' = 'ip'): void {
  const key = generateKey(identifier, type);
  delete store[key];
}

/**
 * Configure rate limits for roles
 */
export function configureRoleLimits(
  limits: Partial<Record<UserRole, Partial<RateLimitConfig>>>
): void {
  for (const [role, config] of Object.entries(limits)) {
    if (role in defaultRoleLimits) {
      defaultRoleLimits[role as UserRole] = {
        ...defaultRoleLimits[role as UserRole],
        ...config,
      };
    }
  }
}
