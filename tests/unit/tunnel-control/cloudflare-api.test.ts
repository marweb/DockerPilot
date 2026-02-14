import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authenticate,
  clearAuthentication,
  CloudflareAPIError,
  getCurrentAccountId,
  initCloudflareAPI,
  isAuthenticated,
  listAccountsWithToken,
} from '../../../services/tunnel-control/src/services/cloudflare-api.js';
import type { Config } from '../../../services/tunnel-control/src/config/index.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockConfig: Config = {
  port: 3002,
  host: '0.0.0.0',
  cloudflaredPath: '/usr/local/bin/cloudflared',
  credentialsDir: '/tmp/test-tunnels',
  logLevel: 'info',
  maxRestarts: 3,
  restartDelay: 5000,
  cloudflareApiUrl: 'https://api.cloudflare.com/client/v4',
  logMaxSize: '10m',
  logMaxFiles: 5,
};

describe('Cloudflare API Service', () => {
  beforeEach(() => {
    initCloudflareAPI(mockConfig);
    clearAuthentication();
    vi.clearAllMocks();
  });

  it('lists accounts with token', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        result: [{ id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'Primary' }],
      }),
    });

    const accounts = await listAccountsWithToken('token-123');

    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('authenticates and auto-selects first account', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        result: [
          { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'Primary' },
          { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'Secondary' },
        ],
      }),
    });

    const result = await authenticate('token-123');

    expect(result.accountId).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(result.accountName).toBe('Primary');
    expect(result.accounts).toHaveLength(2);
    expect(isAuthenticated()).toBe(true);
    expect(getCurrentAccountId()).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('maps 403 to a clear error message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({
        success: false,
        errors: [{ code: 1001, message: 'forbidden' }],
      }),
    });

    await expect(listAccountsWithToken('token-123')).rejects.toThrow(CloudflareAPIError);

    try {
      await listAccountsWithToken('token-123');
    } catch (error) {
      expect((error as CloudflareAPIError).statusCode).toBe(403);
      expect((error as CloudflareAPIError).message).toContain('access denied');
    }
  });
});
