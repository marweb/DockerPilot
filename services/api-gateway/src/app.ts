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
import {
  startRateLimitCleanup,
  heavyOperationRateLimitMiddleware,
} from './middleware/rateLimit.js';
import { proxyRequest } from './proxy/index.js';
import { registerWebSocketProxy } from './websocket/proxy.js';
import './types/fastify.js';

export async function createApp(config: Config) {
  const parsedAnon = process.env.RATE_LIMIT_ANON_MAX
    ? parseInt(process.env.RATE_LIMIT_ANON_MAX, 10)
    : 60;
  const parsedAuth = process.env.RATE_LIMIT_AUTH_MAX
    ? parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10)
    : 120;
  const anonymousRateLimitMax = Number.isFinite(parsedAnon) && parsedAnon > 0 ? parsedAnon : 60;
  const authenticatedRateLimitMax =
    Number.isFinite(parsedAuth) && parsedAuth > 0 ? parsedAuth : 120;

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
    origin: config.corsOrigin ? config.corsOrigin.split(',').map((o) => o.trim()) : true,
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
    max: (request) => {
      const hasBearer =
        typeof request.headers.authorization === 'string' &&
        request.headers.authorization.startsWith('Bearer ');
      return hasBearer ? authenticatedRateLimitMax : anonymousRateLimitMax;
    },
    timeWindow: config.rateLimitWindow,
    keyGenerator: (request) => {
      return request.ip;
    },
    allowList: (request) => {
      const path = request.url.split('?')[0];
      return path === '/healthz' || path.startsWith('/api/health') || path.startsWith('/api/auth/');
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

  // Additional limiter for heavy mutating operations
  fastify.addHook('onRequest', heavyOperationRateLimitMiddleware);

  // Audit middleware for all routes
  fastify.addHook('onRequest', auditMiddleware);

  // Register auth routes
  await fastify.register(authRoutes, { prefix: '/api' });

  // Proxy routes to docker-control
  fastify.all('/api/containers/*', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}${request.url}`);
  });

  fastify.all('/api/containers', async (request, reply) => {
    const queryString = request.url.includes('?') ? `?${request.url.split('?')[1]}` : '';
    await proxyRequest(request, reply, `${config.dockerControlUrl}/api/containers${queryString}`);
  });

  fastify.all('/api/images/*', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}${request.url}`);
  });

  fastify.all('/api/images', async (request, reply) => {
    const queryString = request.url.includes('?') ? `?${request.url.split('?')[1]}` : '';
    await proxyRequest(request, reply, `${config.dockerControlUrl}/api/images${queryString}`);
  });

  fastify.all('/api/volumes/*', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}${request.url}`);
  });

  fastify.all('/api/volumes', async (request, reply) => {
    const queryString = request.url.includes('?') ? `?${request.url.split('?')[1]}` : '';
    await proxyRequest(request, reply, `${config.dockerControlUrl}/api/volumes${queryString}`);
  });

  fastify.all('/api/networks/*', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}${request.url}`);
  });

  fastify.all('/api/networks', async (request, reply) => {
    const queryString = request.url.includes('?') ? `?${request.url.split('?')[1]}` : '';
    await proxyRequest(request, reply, `${config.dockerControlUrl}/api/networks${queryString}`);
  });

  fastify.all('/api/builds/*', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}${request.url}`);
  });

  fastify.all('/api/builds', async (request, reply) => {
    const queryString = request.url.includes('?') ? `?${request.url.split('?')[1]}` : '';
    await proxyRequest(request, reply, `${config.dockerControlUrl}/api/builds${queryString}`);
  });

  fastify.all('/api/compose/*', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}${request.url}`);
  });

  fastify.all('/api/compose', async (request, reply) => {
    const queryString = request.url.includes('?') ? `?${request.url.split('?')[1]}` : '';
    await proxyRequest(request, reply, `${config.dockerControlUrl}/api/compose${queryString}`);
  });

  fastify.all('/api/info', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}/info`);
  });

  fastify.all('/api/version', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}/version`);
  });

  fastify.all('/api/df', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}/df`);
  });

  fastify.all('/api/ping', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}/ping`);
  });

  // Proxy routes to tunnel-control
  fastify.all('/api/tunnels/*', async (request, reply) => {
    await proxyRequest(request, reply, `${config.tunnelControlUrl}${request.url}`);
  });

  // Legacy aliases without /api prefix
  fastify.all('/compose/*', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}/api${request.url}`);
  });

  fastify.all('/compose', async (request, reply) => {
    const queryString = request.url.includes('?') ? `?${request.url.split('?')[1]}` : '';
    await proxyRequest(request, reply, `${config.dockerControlUrl}/api/compose${queryString}`);
  });

  fastify.all('/info', async (request, reply) => {
    await proxyRequest(request, reply, `${config.dockerControlUrl}/info`);
  });

  fastify.all('/api/tunnels', async (request, reply) => {
    const queryString = request.url.includes('?') ? `?${request.url.split('?')[1]}` : '';
    await proxyRequest(request, reply, `${config.tunnelControlUrl}/api/tunnels${queryString}`);
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
