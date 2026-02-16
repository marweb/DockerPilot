import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import '../types/fastify.js';
import { getUser } from '../types/fastify.js';
import {
  getSystemSettings,
  setSystemSetting,
  getSetting,
  setSetting,
  getNotificationChannels,
  getNotificationChannel,
  saveNotificationChannel,
  type NotificationProvider,
} from '../services/database.js';
import { NotificationService } from '../services/notifications.js';
import { encrypt, maskSecret, maskApiKey, maskWebhookUrl } from '../utils/crypto.js';
import {
  isValidTimezone,
  isValidIPv4,
  isValidIPv6,
  isValidUrl,
  isValidEmail,
  isValidResendApiKey,
  isValidTelegramBotToken,
  isValidSlackWebhookUrl,
  isValidDiscordWebhookUrl,
} from '../utils/validation.js';
import { logAuditEntry } from '../middleware/audit.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  emitSystemUpgradeStarted,
  emitSystemUpgradeCompleted,
  emitSystemUpgradeFailed,
} from '../services/eventDispatcher.js';

// Rate limiting for notification tests
const TEST_RATE_LIMIT = 5; // max 5 per minute
const testAttempts = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const minute = 60 * 1000;
  const record = testAttempts.get(key);

  if (!record || now > record.resetTime) {
    testAttempts.set(key, { count: 1, resetTime: now + minute });
    return { allowed: true, remaining: TEST_RATE_LIMIT - 1, resetTime: now + minute };
  }

  if (record.count >= TEST_RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetTime: record.resetTime };
  }

  record.count++;
  return { allowed: true, remaining: TEST_RATE_LIMIT - record.count, resetTime: record.resetTime };
}

function sanitizeError(error: string): string {
  // Remove potential secrets from error messages
  return error
    .replace(/[a-zA-Z0-9_-]*[a-zA-Z]{20,}[a-zA-Z0-9_-]*/g, '[REDACTED]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    .replace(/https?:\/\/[^\s]+/g, '[URL]');
}

const CDN_VERSIONS_URL =
  'https://raw.githubusercontent.com/marweb/DockPilot/master/scripts/versions.json';

// Cache for version check (avoid hammering CDN)
let versionCache: { latest: string; checkedAt: number } | null = null;
const VERSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get current installed version
 */
function getCurrentVersion(): string {
  return process.env.DOCKPILOT_VERSION || '0.0.0';
}

function isNumericVersion(version: string): boolean {
  return /^v?\d+(?:\.\d+)*$/.test(version.trim());
}

function normalizeCurrentVersion(currentVersion: string, latestVersion: string): string {
  const normalized = currentVersion.trim().toLowerCase();
  if (normalized === 'latest') {
    return latestVersion;
  }
  return currentVersion;
}

/**
 * Compare two semver-like version strings
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, '').split('.').map(Number);
  const partsB = b.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * Fetch latest version from CDN
 */
async function fetchLatestVersion(): Promise<string> {
  // Return cached if fresh
  if (versionCache && Date.now() - versionCache.checkedAt < VERSION_CACHE_TTL) {
    return versionCache.latest;
  }

  try {
    const response = await fetch(CDN_VERSIONS_URL, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as { version?: string };
    const latest = data.version || '0.0.0';

    versionCache = { latest, checkedAt: Date.now() };
    return latest;
  } catch (error) {
    // Return cached version if available, even if stale
    if (versionCache) {
      return versionCache.latest;
    }
    throw error;
  }
}

// Extended settings schema with validation (used for type inference only)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _settingsUpdateSchema = z.object({
  instanceName: z.string().min(1).max(100).optional(),
  publicUrl: z.string().optional(),
  timezone: z.string().optional(),
  publicIPv4: z.string().optional(),
  publicIPv6: z.string().optional(),
  autoUpdate: z.boolean().optional(),
});

// Provider enum for notifications
const providerEnum = z.enum(['smtp', 'resend', 'slack', 'telegram', 'discord']);

// SMTP config schema
const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string(),
  password: z.string(),
  encryption: z.enum(['none', 'tls', 'ssl', 'starttls']),
  timeout: z.number().int().min(1).max(300).optional(),
});

// Resend config schema
const resendConfigSchema = z.object({
  apiKey: z.string(),
  fromAddress: z.string(),
});

// Slack config schema
const slackConfigSchema = z.object({
  webhookUrl: z.string(),
});

// Telegram config schema
const telegramConfigSchema = z.object({
  botToken: z.string(),
  chatId: z.string().min(1),
});

// Discord config schema
const discordConfigSchema = z.object({
  webhookUrl: z.string(),
});

// Notification config update schema (used for type inference only)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _notificationConfigSchema = z.object({
  provider: providerEnum,
  name: z.string().min(1).max(100),
  enabled: z.boolean(),
  fromName: z.string().max(100).optional(),
  fromAddress: z
    .string()
    .refine((val) => !val || isValidEmail(val), {
      message: 'Invalid email address',
    })
    .optional(),
  config: z.record(z.unknown()),
});

/**
 * Mask sensitive fields in notification config based on provider
 */
function maskSensitiveFields(
  provider: NotificationProvider,
  config: Record<string, unknown>
): Record<string, unknown> {
  const masked = { ...config };

  switch (provider) {
    case 'smtp':
      if (masked.password) {
        masked.password = maskSecret(String(masked.password), 0);
      }
      break;
    case 'resend':
      if (masked.apiKey) {
        masked.apiKey = maskApiKey(String(masked.apiKey));
      }
      break;
    case 'slack':
      if (masked.webhookUrl) {
        masked.webhookUrl = maskWebhookUrl(String(masked.webhookUrl));
      }
      break;
    case 'telegram':
      if (masked.botToken) {
        masked.botToken = maskSecret(String(masked.botToken), 4);
      }
      break;
    case 'discord':
      if (masked.webhookUrl) {
        masked.webhookUrl = maskWebhookUrl(String(masked.webhookUrl));
      }
      break;
  }

  return masked;
}

/**
 * Encrypt sensitive fields in notification config
 */
function encryptSensitiveFields(
  provider: NotificationProvider,
  config: Record<string, unknown>
): Record<string, string> {
  const masterKey = process.env.MASTER_KEY;
  if (!masterKey) {
    throw new Error('MASTER_KEY is required for encryption');
  }

  const encrypted: Record<string, string> = {};

  // Encrypt all config as JSON for simplicity
  const configJson = JSON.stringify(config);
  encrypted.data = encrypt(configJson, masterKey);

  return encrypted;
}

/**
 * System routes - version checking, settings, upgrade, notifications
 */
export async function systemRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /system/version - Current version info
  fastify.get('/system/version', async (_request, reply) => {
    const currentVersion = getCurrentVersion();

    return reply.send({
      success: true,
      data: {
        currentVersion,
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
      },
    });
  });

  // GET /system/check-update - Check if a new version is available
  fastify.get('/system/check-update', async (_request, reply) => {
    try {
      const rawCurrentVersion = getCurrentVersion();
      const latestVersion = await fetchLatestVersion();
      const currentVersion = normalizeCurrentVersion(rawCurrentVersion, latestVersion);

      const updateAvailable =
        isNumericVersion(latestVersion) && isNumericVersion(currentVersion)
          ? compareVersions(latestVersion, currentVersion) > 0
          : false;

      return reply.send({
        success: true,
        data: {
          currentVersion,
          latestVersion,
          updateAvailable,
          checkedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      fastify.log.error(error, 'Failed to check for updates');
      return reply.status(502).send({
        success: false,
        error: {
          code: 'UPDATE_CHECK_FAILED',
          message: 'Failed to check for updates. Please try again later.',
        },
      });
    }
  });

  // GET /system/settings - Get system settings
  fastify.get('/system/settings', async (_request, reply) => {
    // Get legacy settings from meta table (backwards compatibility)
    const legacySettings = await getSystemSettings();

    // Get new settings from system_settings table
    const settingsKeys = [
      'instance_name',
      'public_url',
      'timezone',
      'public_ipv4',
      'public_ipv6',
      'auto_update',
    ];

    const settings: Record<string, string> = {};
    for (const key of settingsKeys) {
      const setting = await getSetting(key);
      if (setting) {
        settings[key] = setting.value;
      }
    }

    return reply.send({
      success: true,
      data: {
        instanceName: settings.instance_name || 'DockPilot',
        publicUrl: settings.public_url || '',
        timezone: settings.timezone || 'UTC',
        publicIPv4: settings.public_ipv4 || '',
        publicIPv6: settings.public_ipv6 || '',
        autoUpdate: settings.auto_update === 'true' || legacySettings.auto_update === 'true',
        // Legacy field for backwards compatibility
        meta: {
          autoUpdate: settings.auto_update === 'true' || legacySettings.auto_update === 'true',
        },
      },
    });
  });

  // PUT /system/settings - Update system settings
  fastify.put<{ Body: z.infer<typeof _settingsUpdateSchema> }>(
    '/system/settings',
    {
      preHandler: [requireAdmin],
    },
    async (request, reply) => {
      const body = request.body;
      const user = getUser(request);

      // Manual validation
      if (
        body.instanceName !== undefined &&
        (typeof body.instanceName !== 'string' ||
          body.instanceName.length < 1 ||
          body.instanceName.length > 100)
      ) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'instanceName must be between 1 and 100 characters',
          },
        });
      }

      if (body.publicUrl !== undefined && body.publicUrl !== '' && !isValidUrl(body.publicUrl)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid URL format for publicUrl',
          },
        });
      }

      if (body.timezone !== undefined && !isValidTimezone(body.timezone)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid timezone',
          },
        });
      }

      if (
        body.publicIPv4 !== undefined &&
        body.publicIPv4 !== '' &&
        !isValidIPv4(body.publicIPv4)
      ) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid IPv4 address',
          },
        });
      }

      if (
        body.publicIPv6 !== undefined &&
        body.publicIPv6 !== '' &&
        !isValidIPv6(body.publicIPv6)
      ) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid IPv6 address',
          },
        });
      }

      // Track which settings were updated for audit
      const updatedSettings: string[] = [];

      // Update settings in database
      if (body.instanceName !== undefined) {
        await setSetting('instance_name', body.instanceName, 'string', 'Nombre de la instancia');
        updatedSettings.push('instanceName');
      }

      if (body.publicUrl !== undefined) {
        await setSetting('public_url', body.publicUrl, 'string', 'URL pública de la instancia');
        updatedSettings.push('publicUrl');
      }

      if (body.timezone !== undefined) {
        await setSetting('timezone', body.timezone, 'string', 'Zona horaria de la instancia');
        updatedSettings.push('timezone');
      }

      if (body.publicIPv4 !== undefined) {
        await setSetting('public_ipv4', body.publicIPv4, 'string', 'IP pública IPv4');
        updatedSettings.push('publicIPv4');
      }

      if (body.publicIPv6 !== undefined) {
        await setSetting('public_ipv6', body.publicIPv6, 'string', 'IP pública IPv6');
        updatedSettings.push('publicIPv6');
      }

      if (body.autoUpdate !== undefined) {
        await setSetting(
          'auto_update',
          body.autoUpdate.toString(),
          'boolean',
          'Actualizaciones automáticas habilitadas'
        );
        // Also update legacy setting for backwards compatibility
        await setSystemSetting('setting_auto_update', body.autoUpdate.toString());
        updatedSettings.push('autoUpdate');
      }

      // Log audit entry
      if (user && updatedSettings.length > 0) {
        await logAuditEntry({
          userId: user.id,
          username: user.username,
          action: 'system.settings.update',
          resource: 'system',
          resourceId: 'settings',
          details: {
            updatedFields: updatedSettings,
            ip: request.ip,
            userAgent: request.headers['user-agent'] || 'unknown',
          },
          ip: request.ip,
          userAgent: request.headers['user-agent'] || 'unknown',
          success: true,
        });
      }

      // Return updated settings
      const settingsKeys = [
        'instance_name',
        'public_url',
        'timezone',
        'public_ipv4',
        'public_ipv6',
        'auto_update',
      ];

      const settings: Record<string, string> = {};
      for (const key of settingsKeys) {
        const setting = await getSetting(key);
        if (setting) {
          settings[key] = setting.value;
        }
      }

      const legacySettings = await getSystemSettings();

      return reply.send({
        success: true,
        data: {
          instanceName: settings.instance_name || 'DockPilot',
          publicUrl: settings.public_url || '',
          timezone: settings.timezone || 'UTC',
          publicIPv4: settings.public_ipv4 || '',
          publicIPv6: settings.public_ipv6 || '',
          autoUpdate: settings.auto_update === 'true' || legacySettings.auto_update === 'true',
          meta: {
            autoUpdate: settings.auto_update === 'true' || legacySettings.auto_update === 'true',
          },
        },
      });
    }
  );

  // GET /system/notifications/config - Get notification channels configuration
  fastify.get(
    '/system/notifications/config',
    {
      preHandler: [requireAdmin],
    },
    async (_request, reply) => {
      const channels = await getNotificationChannels();

      // Transform channels to mask sensitive data
      const transformedChannels = channels.map((channel) => {
        let config: Record<string, unknown>;
        try {
          config = JSON.parse(channel.config) as Record<string, unknown>;
        } catch {
          config = {};
        }

        // Mask sensitive fields
        const maskedConfig = maskSensitiveFields(channel.provider, config);

        return {
          id: channel.id,
          provider: channel.provider,
          name: channel.name,
          enabled: channel.enabled,
          fromName: channel.fromName,
          fromAddress: channel.fromAddress,
          config: maskedConfig,
          configured: true,
          createdAt: channel.createdAt.toISOString(),
          updatedAt: channel.updatedAt.toISOString(),
        };
      });

      return reply.send({
        success: true,
        data: {
          channels: transformedChannels,
        },
      });
    }
  );

  // PUT /system/notifications/config - Update or create notification channel
  fastify.put<{ Body: z.infer<typeof _notificationConfigSchema> }>(
    '/system/notifications/config',
    {
      preHandler: [requireAdmin],
    },
    async (request, reply) => {
      const body = request.body;
      const user = getUser(request);

      try {
        // Basic validation
        if (
          !body.provider ||
          !['smtp', 'resend', 'slack', 'telegram', 'discord'].includes(body.provider)
        ) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid provider. Must be one of: smtp, resend, slack, telegram, discord',
            },
          });
        }

        if (
          !body.name ||
          typeof body.name !== 'string' ||
          body.name.length < 1 ||
          body.name.length > 100
        ) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'name must be between 1 and 100 characters',
            },
          });
        }

        // Validate provider-specific config
        let validatedConfig: Record<string, unknown>;

        switch (body.provider) {
          case 'smtp':
            validatedConfig = smtpConfigSchema.parse(body.config);
            break;
          case 'resend':
            validatedConfig = resendConfigSchema.parse(body.config);
            if (!isValidResendApiKey(validatedConfig.apiKey as string)) {
              return reply.status(400).send({
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Invalid Resend API key format. Should start with "re_"',
                },
              });
            }
            if (!isValidEmail(validatedConfig.fromAddress as string)) {
              return reply.status(400).send({
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Invalid fromAddress email format',
                },
              });
            }
            break;
          case 'slack':
            validatedConfig = slackConfigSchema.parse(body.config);
            if (!isValidSlackWebhookUrl(validatedConfig.webhookUrl as string)) {
              return reply.status(400).send({
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Invalid Slack webhook URL. Must be from hooks.slack.com',
                },
              });
            }
            break;
          case 'telegram':
            validatedConfig = telegramConfigSchema.parse(body.config);
            if (!isValidTelegramBotToken(validatedConfig.botToken as string)) {
              return reply.status(400).send({
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message:
                    'Invalid Telegram bot token format. Should be in format: numbers:alphanumeric',
                },
              });
            }
            break;
          case 'discord':
            validatedConfig = discordConfigSchema.parse(body.config);
            if (!isValidDiscordWebhookUrl(validatedConfig.webhookUrl as string)) {
              return reply.status(400).send({
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message:
                    'Invalid Discord webhook URL. Must be from discord.com or discordapp.com',
                },
              });
            }
            break;
          default:
            return reply.status(400).send({
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: `Unsupported provider: ${body.provider}`,
              },
            });
        }

        // Check if channel already exists for this provider
        const existingChannel = await getNotificationChannel(body.provider);

        // Encrypt sensitive fields
        const encryptedConfig = encryptSensitiveFields(body.provider, validatedConfig);

        // Save channel
        const savedChannel = await saveNotificationChannel({
          id: existingChannel?.id,
          provider: body.provider,
          name: body.name,
          enabled: body.enabled,
          fromName: body.fromName,
          fromAddress: body.fromAddress,
          config: JSON.stringify(encryptedConfig),
        });

        // Log audit entry
        if (user) {
          await logAuditEntry({
            userId: user.id,
            username: user.username,
            action: existingChannel ? 'system.notifications.update' : 'system.notifications.create',
            resource: 'notifications',
            resourceId: savedChannel.id,
            details: {
              provider: body.provider,
              name: body.name,
              enabled: body.enabled,
              ip: request.ip,
              userAgent: request.headers['user-agent'] || 'unknown',
            },
            ip: request.ip,
            userAgent: request.headers['user-agent'] || 'unknown',
            success: true,
          });
        }

        // Parse config for response (mask sensitive data)
        let responseConfig: Record<string, unknown>;
        try {
          responseConfig = JSON.parse(savedChannel.config) as Record<string, unknown>;
        } catch {
          responseConfig = {};
        }

        const maskedConfig = maskSensitiveFields(savedChannel.provider, responseConfig);

        return reply.send({
          success: true,
          data: {
            id: savedChannel.id,
            provider: savedChannel.provider,
            name: savedChannel.name,
            enabled: savedChannel.enabled,
            fromName: savedChannel.fromName,
            fromAddress: savedChannel.fromAddress,
            config: maskedConfig,
            configured: true,
            createdAt: savedChannel.createdAt.toISOString(),
            updatedAt: savedChannel.updatedAt.toISOString(),
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid configuration',
              details: error.errors,
            },
          });
        }

        fastify.log.error(error, 'Failed to save notification channel');
        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to save notification channel',
          },
        });
      }
    }
  );

  // PUT /system/notifications/general - Save general notification settings (applies to all email providers)
  fastify.put(
    '/system/notifications/general',
    {
      preHandler: [requireAdmin],
    },
    async (request, reply) => {
      const body = request.body as {
        fromName: string;
        fromAddress: string;
      };
      const user = getUser(request);

      if (!user) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
          },
        });
      }

      try {
        // Validate email format
        if (!body.fromAddress || !isValidEmail(body.fromAddress)) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid fromAddress email format',
            },
          });
        }

        // Update all existing email providers
        const emailProviders = ['smtp', 'resend'] as const;
        const updatedChannels: Awaited<ReturnType<typeof getNotificationChannel>>[] = [];

        for (const provider of emailProviders) {
          const existingChannel = await getNotificationChannel(provider);

          if (existingChannel) {
            // Update existing channel with new fromName/fromAddress
            const updatedChannel = await saveNotificationChannel({
              id: existingChannel.id,
              provider: provider,
              name: existingChannel.name,
              enabled: existingChannel.enabled,
              fromName: body.fromName || existingChannel.fromName,
              fromAddress: body.fromAddress,
              config: existingChannel.config,
            });
            updatedChannels.push(updatedChannel);
          }
          // Note: We don't create new channels here, only update existing ones
        }

        // Log the action
        await logAuditEntry({
          userId: user.id,
          username: user.username,
          action: 'notification.general.update',
          resource: 'notification',
          details: {
            fromName: body.fromName,
            fromAddress: body.fromAddress,
            updatedProviders: updatedChannels.length,
          },
          ip: request.ip,
          userAgent: request.headers['user-agent'] || 'unknown',
          success: true,
        });

        return reply.send({
          success: true,
          message: `General notification settings saved. Updated ${updatedChannels.length} provider(s).`,
          data: {
            fromName: body.fromName,
            fromAddress: body.fromAddress,
            updatedProviders: updatedChannels.length,
          },
        });
      } catch (error) {
        fastify.log.error(error, 'Failed to save general notification settings');
        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message:
              error instanceof Error
                ? error.message
                : 'Failed to save general notification settings',
          },
        });
      }
    }
  );

  // POST /system/notifications/test - Test notification channel
  fastify.post(
    '/system/notifications/test',
    {
      preHandler: [requireAdmin],
    },
    async (request, reply) => {
      const body = request.body as {
        provider: NotificationProvider;
        testEmail?: string;
        testMessage?: string;
      };
      const user = getUser(request);

      // Validate body
      if (
        !body.provider ||
        !['smtp', 'resend', 'slack', 'telegram', 'discord'].includes(body.provider)
      ) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid provider. Must be one of: smtp, resend, slack, telegram, discord',
          },
        });
      }

      if (body.testEmail && !isValidEmail(body.testEmail)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid testEmail format',
          },
        });
      }

      // Check rate limit
      const rateLimitKey = `${request.ip}:${body.provider}`;
      const rateLimit = checkRateLimit(rateLimitKey);

      if (!rateLimit.allowed) {
        const waitTime = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
        await logAuditEntry({
          userId: user?.id || 'anonymous',
          username: user?.username || 'anonymous',
          action: 'system.notifications.test',
          resource: 'notifications',
          details: {
            provider: body.provider,
            success: false,
            error: 'Rate limit exceeded',
            rateLimitExceeded: true,
          },
          ip: request.ip,
          userAgent: request.headers['user-agent'] || 'unknown',
          success: false,
        });
        return reply.status(429).send({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded. Please wait ${waitTime} seconds before trying again.`,
            retryAfter: waitTime,
          },
        });
      }

      // Validate testEmail for SMTP/Resend providers
      if ((body.provider === 'smtp' || body.provider === 'resend') && !body.testEmail) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'testEmail is required for email notifications (SMTP/Resend)',
          },
        });
      }

      // Validate that testEmail is different from admin email
      if (body.testEmail && user && body.testEmail.toLowerCase() === user.username?.toLowerCase()) {
        await logAuditEntry({
          userId: user.id,
          username: user.username,
          action: 'system.notifications.test',
          resource: 'notifications',
          details: {
            provider: body.provider,
            success: false,
            error: 'testEmail cannot be the same as admin username',
          },
          ip: request.ip,
          userAgent: request.headers['user-agent'] || 'unknown',
          success: false,
        });
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'testEmail cannot be the same as your username to prevent spam',
          },
        });
      }

      try {
        // Get channel configuration
        const channel = await getNotificationChannel(body.provider);

        if (!channel) {
          await logAuditEntry({
            userId: user?.id || 'anonymous',
            username: user?.username || 'anonymous',
            action: 'system.notifications.test',
            resource: 'notifications',
            details: {
              provider: body.provider,
              success: false,
              error: 'Channel not configured',
            },
            ip: request.ip,
            userAgent: request.headers['user-agent'] || 'unknown',
            success: false,
          });
          return reply.status(404).send({
            success: false,
            error: {
              code: 'CHANNEL_NOT_FOUND',
              message: `Notification channel '${body.provider}' is not configured`,
            },
          });
        }

        if (!channel.enabled) {
          await logAuditEntry({
            userId: user?.id || 'anonymous',
            username: user?.username || 'anonymous',
            action: 'system.notifications.test',
            resource: 'notifications',
            details: {
              provider: body.provider,
              channelId: channel.id,
              success: false,
              error: 'Channel is disabled',
            },
            ip: request.ip,
            userAgent: request.headers['user-agent'] || 'unknown',
            success: false,
          });
          return reply.status(400).send({
            success: false,
            error: {
              code: 'CHANNEL_DISABLED',
              message: `Notification channel '${body.provider}' is currently disabled`,
            },
          });
        }

        // Get instance name for test message
        const instanceName = await getSetting('instance_name').then((s) => s?.value || 'DockPilot');

        // Send test notification
        const masterKey = process.env.MASTER_KEY;
        if (!masterKey) {
          throw new Error('MASTER_KEY is required');
        }

        const notificationService = new NotificationService(masterKey);
        const result = await notificationService.test(
          channel,
          body.testEmail,
          body.testMessage,
          instanceName
        );

        // Log audit entry
        await logAuditEntry({
          userId: user?.id || 'anonymous',
          username: user?.username || 'anonymous',
          action: 'system.notifications.test',
          resource: 'notifications',
          details: {
            provider: body.provider,
            channelId: channel.id,
            success: result.success,
            testEmail: body.testEmail,
            hasCustomMessage: !!body.testMessage,
            rateLimitRemaining: rateLimit.remaining,
          },
          ip: request.ip,
          userAgent: request.headers['user-agent'] || 'unknown',
          success: result.success,
          errorMessage: result.success ? undefined : sanitizeError(result.error || result.message),
        });

        if (result.success) {
          return reply.send({
            success: true,
            message: result.message,
            data: {
              provider: body.provider,
              timestamp: new Date().toISOString(),
              rateLimit: {
                remaining: rateLimit.remaining,
                resetTime: new Date(rateLimit.resetTime).toISOString(),
              },
            },
          });
        } else {
          return reply.status(500).send({
            success: false,
            error: {
              code: 'TEST_FAILED',
              message: result.message,
              details: sanitizeError(result.error || 'Unknown error'),
            },
            data: {
              provider: body.provider,
              timestamp: new Date().toISOString(),
            },
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        fastify.log.error(error, 'Failed to send test notification');

        // Log audit entry for errors
        await logAuditEntry({
          userId: user?.id || 'anonymous',
          username: user?.username || 'anonymous',
          action: 'system.notifications.test',
          resource: 'notifications',
          details: {
            provider: body.provider,
            success: false,
            errorType: 'internal_error',
          },
          ip: request.ip,
          userAgent: request.headers['user-agent'] || 'unknown',
          success: false,
          errorMessage: sanitizeError(errorMessage),
        });

        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to send test notification',
            details: sanitizeError(errorMessage),
          },
        });
      }
    }
  );

  // POST /system/upgrade - Trigger system upgrade (proxied to docker-control)
  // This endpoint is handled by the proxy in app.ts
}
