import type { FastifyInstance } from 'fastify';
import type { UserRole } from '@dockpilot/types';

export interface JWTPayload {
  id: string;
  username: string;
  role: UserRole;
  type?: 'access' | 'refresh';
}

export interface JWTRefreshPayload {
  id: string;
  type: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TokenVerificationResult {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
}

/**
 * Sign a JWT access token
 * @param fastify - Fastify instance with JWT plugin
 * @param payload - Token payload
 * @param expiresIn - Expiration time (default: '15m')
 * @returns Signed JWT token
 */
export function signToken(
  fastify: FastifyInstance,
  payload: Omit<JWTPayload, 'type'>,
  expiresIn: string = '15m'
): string {
  return fastify.jwt.sign({ ...payload, type: 'access' }, { expiresIn });
}

/**
 * Sign a JWT refresh token
 * @param fastify - Fastify instance with JWT plugin
 * @param userId - User ID
 * @param expiresIn - Expiration time (default: '7d')
 * @returns Signed refresh token
 */
export function signRefreshToken(
  fastify: FastifyInstance,
  userId: string,
  expiresIn: string = '7d'
): string {
  return fastify.jwt.sign({ id: userId, type: 'refresh' }, { expiresIn });
}

/**
 * Generate a token pair (access + refresh)
 * @param fastify - Fastify instance with JWT plugin
 * @param user - User data
 * @param accessExpiresIn - Access token expiration
 * @param refreshExpiresIn - Refresh token expiration
 * @returns Token pair with expiration info
 */
export function generateTokenPair(
  fastify: FastifyInstance,
  user: { id: string; username: string; role: UserRole },
  accessExpiresIn: string = '15m',
  refreshExpiresIn: string = '7d'
): TokenPair {
  const accessToken = signToken(fastify, user, accessExpiresIn);
  const refreshToken = signRefreshToken(fastify, user.id, refreshExpiresIn);

  // Calculate expiration in seconds
  const expiresInMatch = accessExpiresIn.match(/(\d+)([smhd])/);
  let expiresIn = 900; // Default 15 minutes

  if (expiresInMatch) {
    const value = parseInt(expiresInMatch[1], 10);
    const unit = expiresInMatch[2];
    switch (unit) {
      case 's':
        expiresIn = value;
        break;
      case 'm':
        expiresIn = value * 60;
        break;
      case 'h':
        expiresIn = value * 60 * 60;
        break;
      case 'd':
        expiresIn = value * 60 * 60 * 24;
        break;
    }
  }

  return {
    accessToken,
    refreshToken,
    expiresIn,
  };
}

/**
 * Verify a JWT token
 * @param fastify - Fastify instance with JWT plugin
 * @param token - Token to verify
 * @returns Verification result with payload or error
 */
export function verifyToken(fastify: FastifyInstance, token: string): TokenVerificationResult {
  try {
    const payload = fastify.jwt.verify(token) as JWTPayload;

    if (payload.type !== 'access') {
      return {
        valid: false,
        error: 'Invalid token type',
      };
    }

    return {
      valid: true,
      payload,
    };
  } catch (error) {
    let errorMessage = 'Invalid token';

    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        errorMessage = 'Token has expired';
      } else if (error.message.includes('signature')) {
        errorMessage = 'Invalid token signature';
      } else if (error.message.includes('malformed')) {
        errorMessage = 'Malformed token';
      }
    }

    return {
      valid: false,
      error: errorMessage,
    };
  }
}

/**
 * Verify a refresh token
 * @param fastify - Fastify instance with JWT plugin
 * @param token - Refresh token to verify
 * @returns Verification result with user ID or error
 */
export function verifyRefreshToken(
  fastify: FastifyInstance,
  token: string
): { valid: boolean; userId?: string; error?: string } {
  try {
    const payload = fastify.jwt.verify(token) as JWTRefreshPayload;

    if (payload.type !== 'refresh') {
      return {
        valid: false,
        error: 'Invalid token type',
      };
    }

    return {
      valid: true,
      userId: payload.id,
    };
  } catch (error) {
    let errorMessage = 'Invalid refresh token';

    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        errorMessage = 'Refresh token has expired';
      }
    }

    return {
      valid: false,
      error: errorMessage,
    };
  }
}

/**
 * Decode a token without verification (for inspection only)
 * @param fastify - Fastify instance with JWT plugin
 * @param token - Token to decode
 * @returns Decoded payload or null
 */
export function decodeToken(fastify: FastifyInstance, token: string): JWTPayload | null {
  try {
    return fastify.jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Refresh token rotation - generate new token pair
 * @param fastify - Fastify instance with JWT plugin
 * @param refreshToken - Current refresh token
 * @param user - User data
 * @returns New token pair or null if refresh token is invalid
 */
export function rotateRefreshToken(
  fastify: FastifyInstance,
  refreshToken: string,
  user: { id: string; username: string; role: UserRole },
  accessExpiresIn: string = '15m',
  refreshExpiresIn: string = '7d'
): TokenPair | null {
  const verification = verifyRefreshToken(fastify, refreshToken);

  if (!verification.valid || verification.userId !== user.id) {
    return null;
  }

  // Generate new token pair
  return generateTokenPair(fastify, user, accessExpiresIn, refreshExpiresIn);
}

/**
 * Calculate token expiration time
 * @param token - JWT token
 * @returns Expiration timestamp or null
 */
export function getTokenExpiration(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload.exp || null;
  } catch {
    return null;
  }
}

/**
 * Check if token is expired
 * @param token - JWT token
 * @returns True if expired or invalid
 */
export function isTokenExpired(token: string): boolean {
  const exp = getTokenExpiration(token);
  if (!exp) return true;

  return Date.now() >= exp * 1000;
}

/**
 * Get time until token expires
 * @param token - JWT token
 * @returns Time in seconds until expiration, 0 if expired
 */
export function getTimeUntilExpiration(token: string): number {
  const exp = getTokenExpiration(token);
  if (!exp) return 0;

  const remaining = exp * 1000 - Date.now();
  return Math.max(0, Math.floor(remaining / 1000));
}

/**
 * Extract token from Authorization header
 * @param authHeader - Authorization header value
 * @returns Token or null
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.substring(7);
}

/**
 * Error codes for JWT operations
 */
export const JWTErrors = {
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_MALFORMED: 'TOKEN_MALFORMED',
  TOKEN_SIGNATURE_INVALID: 'TOKEN_SIGNATURE_INVALID',
  TOKEN_TYPE_INVALID: 'TOKEN_TYPE_INVALID',
  NO_TOKEN: 'NO_TOKEN',
} as const;
