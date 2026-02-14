import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { createApp } from '../../src/app.js';
import type { Config } from '../../src/config/index.js';

const tempDirs: string[] = [];

async function buildConfig(): Promise<Config> {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'dockpilot-api-gateway-test-'));
  tempDirs.push(dataDir);

  return {
    port: 3000,
    host: '127.0.0.1',
    corsOrigin: '*',
    jwtSecret: 'test-secret-with-at-least-thirty-two-characters',
    jwtExpiresIn: '15m',
    refreshTokenExpiresIn: '7d',
    dockerControlUrl: 'http://127.0.0.1:3901',
    tunnelControlUrl: 'http://127.0.0.1:3902',
    dataDir,
    logLevel: 'error',
    rateLimitMax: 100,
    rateLimitWindow: '1 minute',
  };
}

describe('api-gateway health endpoint', () => {
  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('returns healthy status at /healthz', async () => {
    const app = await createApp(await buildConfig());

    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'healthy' });

    await app.close();
  });
});
