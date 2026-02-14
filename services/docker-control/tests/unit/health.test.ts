import { describe, it, expect } from 'vitest';
import { createApp } from '../../src/app.js';
import type { Config } from '../../src/config/index.js';

const config: Config = {
  port: 3001,
  host: '127.0.0.1',
  dockerHost: 'unix:///var/run/docker.sock',
  logLevel: 'error',
};

describe('docker-control health endpoint', () => {
  it('returns alive status at /healthz', async () => {
    const app = await createApp(config);

    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'alive' });

    await app.close();
  });
});
