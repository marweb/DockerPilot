import type { FastifyInstance } from 'fastify';
import {
  CloudflareAuthSchema,
  CloudflareLoginSchema,
  type CloudflareAuthInput,
  type CloudflareLoginInput,
} from '../schemas/index.js';
import {
  authenticate,
  isAuthenticated,
  getCurrentAccountId,
  clearAuthentication,
  getAccountInfo,
  listAvailableAccounts,
  CloudflareAPIError,
} from '../services/cloudflare-api.js';
import {
  saveCredentials,
  loadCredentials,
  deleteCredentials,
  listStoredAccounts,
} from '../services/credentials.js';
import { loginWithCloudflare, checkAuthStatus, logout } from '../services/cloudflared.js';
import { getLogger } from '../utils/logger.js';
import { addAuthDebugEntry, listAuthDebugEntries } from '../services/auth-debug-log.js';

const logger = getLogger();

export async function authRoutes(fastify: FastifyInstance) {
  // Login with API token
  fastify.post<{
    Body: CloudflareAuthInput;
  }>(
    '/tunnels/auth/login',
    {
      schema: {
        body: CloudflareAuthSchema,
      },
    },
    async (request, reply) => {
      try {
        const { apiToken, accountId } = request.body;

        addAuthDebugEntry({
          timestamp: new Date().toISOString(),
          action: 'api_token_login_attempt',
          success: true,
          message: 'Attempting Cloudflare API token login',
          details: { accountId },
        });

        logger.info({ accountId }, 'Attempting Cloudflare authentication');

        // Validate token with Cloudflare API and auto-select account if not provided
        const authResult = await authenticate(apiToken, accountId);
        const selectedAccountId = authResult.accountId;
        const accountInfo = await getAccountInfo(selectedAccountId);

        // Save credentials securely
        await saveCredentials(selectedAccountId, {
          apiToken,
          accountId: selectedAccountId,
          email: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        logger.info(
          { accountId: selectedAccountId, accountName: accountInfo.name },
          'Cloudflare authentication successful'
        );

        addAuthDebugEntry({
          timestamp: new Date().toISOString(),
          action: 'api_token_login_success',
          success: true,
          message: 'Cloudflare API token login successful',
          details: {
            accountId: selectedAccountId,
            accountName: accountInfo.name,
            accountsFound: authResult.accounts.length,
          },
        });

        return reply.send({
          success: true,
          message: 'Authentication successful',
          data: {
            authenticated: true,
            accountId: selectedAccountId,
            accountName: accountInfo.name,
            accounts: authResult.accounts,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Cloudflare authentication failed');

        addAuthDebugEntry({
          timestamp: new Date().toISOString(),
          action: 'api_token_login_error',
          success: false,
          message: (error as Error).message,
          details:
            error instanceof CloudflareAPIError
              ? { statusCode: error.statusCode, cloudflareCode: error.code }
              : undefined,
        });

        if (error instanceof CloudflareAPIError) {
          return reply.status(error.statusCode).send({
            success: false,
            error: {
              code: 'AUTH_FAILED',
              message: error.message,
              details: error.code ? { cloudflareCode: error.code } : undefined,
            },
          });
        }

        return reply.status(400).send({
          success: false,
          error: {
            code: 'AUTH_FAILED',
            message: (error as Error).message,
          },
        });
      }
    }
  );

  // OAuth login (via cloudflared)
  fastify.post<{
    Body: CloudflareLoginInput;
  }>(
    '/tunnels/auth/login/oauth',
    {
      schema: {
        body: CloudflareLoginSchema,
      },
    },
    async (_request, reply) => {
      try {
        const result = await loginWithCloudflare();

        addAuthDebugEntry({
          timestamp: new Date().toISOString(),
          action: 'oauth_login_start',
          success: true,
          message: 'Cloudflare OAuth login initiated',
          details: { loginUrl: result.url },
        });

        logger.info('OAuth login initiated');

        return reply.send({
          success: true,
          message: 'Please open the provided URL in your browser to complete authentication',
          data: {
            loginUrl: result.url,
            method: 'oauth',
          },
        });
      } catch (error) {
        logger.error({ error }, 'OAuth login failed');

        addAuthDebugEntry({
          timestamp: new Date().toISOString(),
          action: 'oauth_login_error',
          success: false,
          message: (error as Error).message,
        });

        return reply.status(400).send({
          success: false,
          error: {
            code: 'OAUTH_FAILED',
            message: (error as Error).message,
          },
        });
      }
    }
  );

  // Logout
  fastify.post('/tunnels/auth/logout', async (_request, reply) => {
    try {
      const currentAccount = getCurrentAccountId();

      addAuthDebugEntry({
        timestamp: new Date().toISOString(),
        action: 'logout_attempt',
        success: true,
        message: 'Attempting Cloudflare logout',
        details: { accountId: currentAccount || undefined },
      });

      // Stop all tunnels and logout from cloudflared
      await logout();

      // Clear local authentication
      clearAuthentication();

      // Delete stored credentials if exists
      if (currentAccount) {
        await deleteCredentials(currentAccount);
      }

      logger.info('Logout successful');

      addAuthDebugEntry({
        timestamp: new Date().toISOString(),
        action: 'logout_success',
        success: true,
        message: 'Cloudflare logout successful',
      });

      return reply.send({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      logger.error({ error }, 'Logout failed');

      addAuthDebugEntry({
        timestamp: new Date().toISOString(),
        action: 'logout_error',
        success: false,
        message: (error as Error).message,
      });

      // Even if logout fails, clear local auth
      clearAuthentication();

      return reply.status(500).send({
        success: false,
        error: {
          code: 'LOGOUT_ERROR',
          message: (error as Error).message,
        },
      });
    }
  });

  // Check auth status
  fastify.get('/tunnels/auth/status', async (_request, reply) => {
    try {
      if (!isAuthenticated()) {
        const storedAccounts = await listStoredAccounts();
        if (storedAccounts.length > 0) {
          const creds = await loadCredentials(storedAccounts[0]);
          if (creds) {
            try {
              await authenticate(creds.apiToken, creds.accountId);
            } catch (error) {
              logger.warn({ error }, 'Failed to restore API token session from stored credentials');
            }
          }
        }
      }

      // Check cloudflared status
      const cloudflaredStatus = await checkAuthStatus();

      // Check if we have stored credentials
      const accounts = await listStoredAccounts();
      const hasCredentials = accounts.length > 0;

      let availableAccounts: Array<{ id: string; name: string }> = [];
      if (isAuthenticated()) {
        try {
          availableAccounts = await listAvailableAccounts();
        } catch (error) {
          logger.debug({ error }, 'Unable to list Cloudflare accounts in status endpoint');
        }
      }

      const status = {
        authenticated: isAuthenticated() || cloudflaredStatus.authenticated,
        method: hasCredentials ? 'api_token' : cloudflaredStatus.authenticated ? 'oauth' : null,
        accountId: getCurrentAccountId() || cloudflaredStatus.accountId,
        accountName:
          availableAccounts.find((account) => account.id === getCurrentAccountId())?.name ||
          cloudflaredStatus.accountName ||
          cloudflaredStatus.accountId,
        hasStoredCredentials: hasCredentials,
        accounts: accounts,
        availableAccounts,
      };

      return reply.send({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to check auth status');

      addAuthDebugEntry({
        timestamp: new Date().toISOString(),
        action: 'status_error',
        success: false,
        message: (error as Error).message,
      });

      return reply.status(500).send({
        success: false,
        error: {
          code: 'STATUS_ERROR',
          message: (error as Error).message,
        },
      });
    }
  });

  // Get auth debug logs
  fastify.get('/tunnels/auth/logs', async (request, reply) => {
    const limitRaw = (request.query as { limit?: string } | undefined)?.limit;
    const limit = limitRaw ? parseInt(limitRaw, 10) : 80;

    return reply.send({
      success: true,
      data: {
        logs: listAuthDebugEntries(limit),
      },
    });
  });

  // Get account information
  fastify.get('/tunnels/auth/account', async (_request, reply) => {
    try {
      const accountId = getCurrentAccountId();

      if (!accountId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'NOT_AUTHENTICATED',
            message: 'Not authenticated with Cloudflare',
          },
        });
      }

      const accountInfo = await getAccountInfo(accountId);

      return reply.send({
        success: true,
        data: {
          id: accountInfo.id,
          name: accountInfo.name,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get account info');

      if (error instanceof CloudflareAPIError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            code: 'API_ERROR',
            message: error.message,
          },
        });
      }

      return reply.status(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: (error as Error).message,
        },
      });
    }
  });

  // List stored accounts
  fastify.get('/tunnels/auth/accounts', async (_request, reply) => {
    try {
      const accounts = await listStoredAccounts();
      const accountsData = [];

      for (const accountId of accounts) {
        const creds = await loadCredentials(accountId);
        if (creds) {
          accountsData.push({
            accountId: creds.accountId,
            createdAt: creds.createdAt,
            updatedAt: creds.updatedAt,
          });
        }
      }

      return reply.send({
        success: true,
        data: accountsData,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list accounts');

      return reply.status(500).send({
        success: false,
        error: {
          code: 'LIST_ERROR',
          message: (error as Error).message,
        },
      });
    }
  });

  // List available accounts for current API token
  fastify.get('/tunnels/auth/accounts/available', async (_request, reply) => {
    try {
      const accounts = await listAvailableAccounts();
      return reply.send({
        success: true,
        data: accounts,
      });
    } catch (error) {
      if (error instanceof CloudflareAPIError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            code: 'API_ERROR',
            message: error.message,
          },
        });
      }

      return reply.status(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: (error as Error).message,
        },
      });
    }
  });

  // Select active account from stored credentials
  fastify.post<{ Body: { accountId: string } }>(
    '/tunnels/auth/account/select',
    async (request, reply) => {
      try {
        const { accountId } = request.body;
        if (!accountId) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'accountId is required',
            },
          });
        }

        const creds = await loadCredentials(accountId);
        if (!creds) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Stored credentials not found for this account',
            },
          });
        }

        const authResult = await authenticate(creds.apiToken, accountId);

        return reply.send({
          success: true,
          data: {
            authenticated: true,
            accountId: authResult.accountId,
            accountName: authResult.accountName,
            accounts: authResult.accounts,
          },
        });
      } catch (error) {
        if (error instanceof CloudflareAPIError) {
          return reply.status(error.statusCode).send({
            success: false,
            error: {
              code: 'API_ERROR',
              message: error.message,
            },
          });
        }

        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: (error as Error).message,
          },
        });
      }
    }
  );
}
