import { loadConfig } from './config/index.js';
import { createApp } from './app.js';
import {
  isSetupComplete,
  completeSetup,
  createUser,
  findUserByUsername,
} from './services/database.js';
import { hashPassword, getPasswordBackendStatus } from './utils/password.js';

async function main() {
  const config = loadConfig();

  const passwordBackend = await getPasswordBackendStatus();
  if (passwordBackend.degraded) {
    console.warn(
      `[startup] password backend degraded: active=${passwordBackend.active}, reason=${passwordBackend.reason}`
    );
  } else {
    console.log(`[startup] password backend: ${passwordBackend.active}`);
  }

  // Validate required config
  if (!config.jwtSecret) {
    console.error('JWT_SECRET environment variable is required');
    process.exit(1);
  }

  const app = await createApp(config);

  // Check if setup is needed and create initial admin if password provided
  let setupComplete = await isSetupComplete();
  if (!setupComplete && config.initialAdminPassword) {
    app.log.info('Creating initial admin user...');

    const existingAdmin = await findUserByUsername('admin');
    if (!existingAdmin) {
      const passwordHash = await hashPassword(config.initialAdminPassword);
      await createUser({
        username: 'admin',
        passwordHash,
        role: 'admin',
      });
      await completeSetup();
      setupComplete = true;
      app.log.info('Initial admin user created with username: admin');
      app.log.warn('IMPORTANT: Please change the admin password after first login!');
    }
  }

  // Start server
  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`API Gateway listening on http://${config.host}:${config.port}`);

    if (!setupComplete) {
      app.log.warn('');
      app.log.warn('═══════════════════════════════════════════════════════════════');
      app.log.warn('  SETUP REQUIRED: Please complete the initial setup');
      app.log.warn('  Open the web interface to create your admin account');
      app.log.warn('═══════════════════════════════════════════════════════════════');
      app.log.warn('');
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'] as const;
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down...`);
      await app.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
