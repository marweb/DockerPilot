import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod';
import type { Config } from './config/index.js';
import { initDatabase } from './services/database.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { healthRoutes } from './routes/health.js';
import { systemRoutes } from './routes/system.js';
import { authMiddleware, routePermissionMiddleware } from './middleware/auth.js';
import { auditMiddleware } from './middleware/audit.js';
import { startRateLimitCleanup } from './middleware/rateLimit.js';
import { proxyRequest } from './proxy/index.js';
import { registerWebSocketProxy } from './websocket/proxy.js';
import './types/fastify.js';

export async function createApp(config: Config) {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // Store config
  fastify.decorate('config', config);

  // Enable Zod schemas in route `schema` blocks
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // Initialize database
  initDatabase(config.dataDir);

  // Register plugins
  await fastify.register(cors, {
    origin: config.corsOrigin
      ? config.corsOrigin.split(',').map((o) => o.trim())
      : true,
    credentials: true,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  });

  await fastify.register(jwt, {
    secret: config.jwtSecret,
  });

  await fastify.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    keyGenerator: (request) => {
      return request.ip;
    },
  });

  await fastify.register(websocket);

  // Health check endpoint
  fastify.get('/healthz', async (_request, reply) => {
    return reply.send({
      status: 'healthy',
      version: process.env.DOCKPILOT_VERSION || '0.0.0',
    });
  });

  // Auth middleware for REST routes
  fastify.addHook('onRequest', authMiddleware);

  // RBAC middleware for REST routes
  fastify.addHook('onRequest', routePermissionMiddleware);

  // Audit middleware for all routes
  fastify.addHook('onRequest', auditMiddleware);

  // Register auth routes
  await fastify.register(authRoutes, { prefix: '/api' });

  // Proxy routes to docker-control
  fastify.all('/api/containers/*', async (request, reply) => {
    const path = request.url.replace('/api', '');
    await proxyRequest(request, reply, `${config.dockerControlUrl}${path}`);
  });

  fastify.all('/api/images/*', async (request, reply) => {
    const path = request.url.replace('/api', '');
    await proxyRequest(request, reply, `${config.dockerControlUrl}${path}`);
  });

  fastify.all('/api/volumes/*', async (request, reply) => {
    const path = request.url.replace('/api', '');
    await proxyRequest(request, reply, `${config.dockerControlUrl}${path}`);
  });

  fastify.all('/api/networks/*', async (request, reply) => {
    const path = request.url.replace('/api', '');
    await proxyRequest(request, reply, `${config.dockerControlUrl}${path}`);
  });

  fastify.all('/api/builds/*', async (request, reply) => {
    const path = request.url.replace('/api', '');
    await proxyRequest(request, reply, `${config.dockerControlUrl}${path}`);
  });

  fastify.all('/api/compose/*', async (request, reply) => {
    const path = request.url.replace('/api', '');
    await proxyRequest(request, reply, `${config.dockerControlUrl}${path}`);
  });

  fastify.all('/api/info', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}/api/info`);
  });

  fastify.all('/api/version', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}/api/version`);
  });

  fastify.all('/api/df', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}/api/df`);
  });

  fastify.all('/api/ping', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}/api/ping`);
  });

  // Proxy routes to tunnel-control
  fastify.all('/api/tunnels/*', async (request, reply) => {
    const path = request.url.replace('/api', '');
    await proxyRequest(request, reply, `${config.tunnelControlUrl}${path}`);
  });

  // Register WebSocket proxy with authentication
  await fastify.register(async function (fastify) {
    await registerWebSocketProxy(fastify, config);
  });

  // Start rate limit cleanup
  startRateLimitCleanup();

  // Register user routes
  await fastify.register(userRoutes, { prefix: '/api/users' });

  // Register health routes
  await fastify.register(healthRoutes, { prefix: '/api/health' });

  // Register system routes (version check, settings, upgrade)
  await fastify.register(systemRoutes, { prefix: '/api' });

  // Proxy upgrade request to docker-control
  fastify.post('/api/system/upgrade', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}/system/upgrade`);
  });

  // Proxy upgrade status request to docker-control
  fastify.get('/api/system/upgrade-status', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}/system/upgrade-status`);
  });

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error({ error: error.message, stack: error.stack }, 'Request error');

    const statusCode = error.statusCode || 500;

    reply.status(statusCode).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
        details: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      },
    });
  });

  return fastify;
}
