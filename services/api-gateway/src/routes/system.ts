import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import '../types/fastify.js';
import { getSystemSetting, setSystemSetting, getSystemSettings } from '../services/database.js';

const CDN_VERSIONS_URL = 'https://raw.githubusercontent.com/marweb/DockerPilot/master/scripts/versions.json';

// Cache for version check (avoid hammering CDN)
let versionCache: { latest: string; checkedAt: number } | null = null;
const VERSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get current installed version
 */
function getCurrentVersion(): string {
  return process.env.DOCKPILOT_VERSION || '0.0.0';
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

// Settings validation
const settingsSchema = z.object({
  autoUpdate: z.boolean().optional(),
});

/**
 * System routes - version checking, settings, upgrade
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
      const currentVersion = getCurrentVersion();
      const latestVersion = await fetchLatestVersion();
      const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;

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
    const settings = await getSystemSettings();

    return reply.send({
      success: true,
      data: {
        autoUpdate: settings.auto_update === 'true',
      },
    });
  });

  // PUT /system/settings - Update system settings
  fastify.put<{ Body: z.infer<typeof settingsSchema> }>(
    '/system/settings',
    {
      schema: {
        body: settingsSchema,
      },
    },
    async (request, reply) => {
      const { autoUpdate } = request.body;

      if (autoUpdate !== undefined) {
        await setSystemSetting('setting_auto_update', autoUpdate.toString());
      }

      const settings = await getSystemSettings();

      return reply.send({
        success: true,
        data: {
          autoUpdate: settings.auto_update === 'true',
        },
      });
    }
  );

  // POST /system/upgrade - Trigger system upgrade (proxied to docker-control)
  // This endpoint is handled by the proxy in app.ts
}
