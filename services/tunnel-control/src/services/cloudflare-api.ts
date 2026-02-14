import type { Config } from '../config/index.js';

interface CloudflareErrorResponse {
  success: boolean;
  errors: Array<{
    code: number;
    message: string;
  }>;
}

interface CloudflareApiResponse<T> {
  success: boolean;
  result: T;
  errors?: Array<{ code: number; message: string }>;
}

export interface CloudflareAccount {
  id: string;
  name: string;
}

export interface CloudflareTunnel {
  id: string;
  name: string;
  account_tag: string;
  created_at: string;
  deleted_at: string | null;
  connections: Array<{
    id: string;
    connected_at: string;
    disconnected_at: string | null;
    origin_ip: string;
    opened_by: string;
  }>;
  status: string;
}

interface CloudflareTunnelConfig {
  ingress?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface TunnelCredentials {
  AccountTag: string;
  TunnelSecret: string;
  TunnelID: string;
  TunnelName: string;
}

let currentToken: string | null = null;
let currentAccountId: string | null = null;
let baseUrl = 'https://api.cloudflare.com/client/v4';

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_REQUESTS = 120;
const RATE_LIMIT_WINDOW = 60 * 1000;

export function initCloudflareAPI(cfg: Config): void {
  baseUrl = cfg.cloudflareApiUrl;
}

export async function authenticate(
  token: string,
  preferredAccountId?: string
): Promise<{ accountId: string; accountName: string; accounts: CloudflareAccount[] }> {
  const accounts = await listAccountsWithToken(token);
  if (accounts.length === 0) {
    throw new CloudflareAPIError('No Cloudflare accounts found for this token', 403, 1001);
  }

  const selected = preferredAccountId
    ? accounts.find((account) => account.id === preferredAccountId)
    : accounts[0];

  if (!selected) {
    throw new CloudflareAPIError('Provided account_id is not available for this token', 403, 1002);
  }

  currentToken = token;
  currentAccountId = selected.id;

  return {
    accountId: selected.id,
    accountName: selected.name,
    accounts,
  };
}

export async function listAccountsWithToken(token: string): Promise<CloudflareAccount[]> {
  const response = await fetch(`${baseUrl}/accounts`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = (await response.json()) as CloudflareApiResponse<
    Array<{ id: string; name: string }>
  >;
  return (data.result || []).map((account) => ({ id: account.id, name: account.name }));
}

export async function listAvailableAccounts(): Promise<CloudflareAccount[]> {
  ensureAuthenticated();
  return listAccountsWithToken(currentToken!);
}

export function isAuthenticated(): boolean {
  return currentToken !== null && currentAccountId !== null;
}

export function getCurrentAccountId(): string | null {
  return currentAccountId;
}

export function clearAuthentication(): void {
  currentToken = null;
  currentAccountId = null;
}

export async function listTunnels(accountId: string): Promise<CloudflareTunnel[]> {
  checkRateLimit('listTunnels');
  return request<CloudflareTunnel[]>(`/accounts/${accountId}/cfd_tunnel?is_deleted=false`, {
    method: 'GET',
  });
}

export async function createTunnel(name: string, accountId: string): Promise<CloudflareTunnel> {
  checkRateLimit('createTunnel');
  return request<CloudflareTunnel>(`/accounts/${accountId}/cfd_tunnel`, {
    method: 'POST',
    body: { name },
  });
}

export async function deleteTunnel(id: string, accountId: string): Promise<void> {
  checkRateLimit('deleteTunnel');
  await request(`/accounts/${accountId}/cfd_tunnel/${id}`, {
    method: 'DELETE',
  });
}

export async function getTunnel(id: string, accountId: string): Promise<CloudflareTunnel> {
  checkRateLimit('getTunnel');
  return request<CloudflareTunnel>(`/accounts/${accountId}/cfd_tunnel/${id}`, {
    method: 'GET',
  });
}

export async function getTunnelToken(id: string, accountId: string): Promise<TunnelCredentials> {
  checkRateLimit('getTunnelToken');
  const encoded = await request<string>(`/accounts/${accountId}/cfd_tunnel/${id}/token`, {
    method: 'GET',
  });
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  return JSON.parse(decoded) as TunnelCredentials;
}

export async function getTunnelConfiguration(
  id: string,
  accountId: string
): Promise<CloudflareTunnelConfig> {
  checkRateLimit('getTunnelConfiguration');
  return request<CloudflareTunnelConfig>(`/accounts/${accountId}/cfd_tunnel/${id}/configurations`, {
    method: 'GET',
  });
}

export async function updateTunnelConfiguration(
  id: string,
  accountId: string,
  config: CloudflareTunnelConfig
): Promise<CloudflareTunnelConfig> {
  checkRateLimit('updateTunnelConfiguration');
  return request<CloudflareTunnelConfig>(`/accounts/${accountId}/cfd_tunnel/${id}/configurations`, {
    method: 'PUT',
    body: config,
  });
}

export async function getAccountInfo(accountId: string): Promise<{ id: string; name: string }> {
  checkRateLimit('getAccountInfo');
  const result = await request<{ id: string; name: string }>(`/accounts/${accountId}`, {
    method: 'GET',
  });
  return { id: result.id, name: result.name };
}

function ensureAuthenticated(): void {
  if (!currentToken || !currentAccountId) {
    throw new CloudflareAPIError('Not authenticated with Cloudflare', 401, 1000);
  }
}

async function request<T = unknown>(
  path: string,
  options: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown }
): Promise<T> {
  ensureAuthenticated();

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${currentToken}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = (await response.json()) as CloudflareApiResponse<T>;
  return data.result;
}

function checkRateLimit(operation: string): void {
  const now = Date.now();
  const key = `${operation}:${currentAccountId || 'anonymous'}`;
  const limit = rateLimitStore.get(key);

  if (limit) {
    if (now > limit.resetTime) {
      rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    } else if (limit.count >= RATE_LIMIT_REQUESTS) {
      throw new CloudflareAPIError(
        `Cloudflare API rate limit exceeded for ${operation}. Try again in a minute.`,
        429,
        10001
      );
    } else {
      limit.count++;
    }
  } else {
    rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
  }
}

async function parseError(response: Response): Promise<CloudflareAPIError> {
  try {
    const error = (await response.json()) as CloudflareErrorResponse;
    const apiMessage = error.errors?.[0]?.message || `HTTP ${response.status}`;
    const cloudflareCode = error.errors?.[0]?.code;
    const normalizedMessage = mapCloudflareErrorMessage(response.status, apiMessage);

    return new CloudflareAPIError(normalizedMessage, response.status, cloudflareCode, apiMessage);
  } catch {
    const normalizedMessage = mapCloudflareErrorMessage(response.status, `HTTP ${response.status}`);
    return new CloudflareAPIError(normalizedMessage, response.status);
  }
}

function mapCloudflareErrorMessage(statusCode: number, fallback: string): string {
  if (statusCode === 401) {
    return 'Cloudflare authentication failed. Verify the API token.';
  }
  if (statusCode === 403) {
    return 'Cloudflare access denied. The token needs Tunnel Edit permission on this account.';
  }
  if (statusCode === 404) {
    return 'Cloudflare resource not found. Verify account_id or tunnel_id.';
  }
  if (statusCode === 429) {
    return 'Cloudflare rate limit reached. Please retry in a minute.';
  }
  return fallback;
}

export class CloudflareAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: number,
    public rawMessage?: string
  ) {
    super(message);
    this.name = 'CloudflareAPIError';
  }
}
