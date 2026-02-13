import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserRole } from '@dockpilot/types';
import { getUser } from '../types/fastify.js';

// Permission definitions by role
const rolePermissions: Record<UserRole, string[]> = {
  admin: [
    'containers:*',
    'images:*',
    'volumes:*',
    'networks:*',
    'builds:*',
    'compose:*',
    'tunnels:*',
    'users:*',
    'settings:*',
    'system:*',
  ],
  operator: [
    'containers:list',
    'containers:get',
    'containers:start',
    'containers:stop',
    'containers:restart',
    'containers:logs',
    'containers:exec',
    'containers:stats',
    'images:list',
    'images:get',
    'images:pull',
    'images:history',
    'volumes:list',
    'volumes:get',
    'networks:list',
    'networks:get',
    'builds:create',
    'builds:get',
    'compose:list',
    'compose:get',
    'compose:up',
    'compose:down',
    'compose:logs',
    'tunnels:list',
    'tunnels:get',
    'tunnels:start',
    'tunnels:stop',
    'system:*',
  ],
  viewer: [
    'containers:list',
    'containers:get',
    'containers:logs',
    'containers:stats',
    'images:list',
    'images:get',
    'images:history',
    'volumes:list',
    'volumes:get',
    'networks:list',
    'networks:get',
    'builds:get',
    'compose:list',
    'compose:get',
    'compose:logs',
    'tunnels:list',
    'tunnels:get',
    'system:*',
  ],
};

// Check if a role has a specific permission
function hasPermission(role: UserRole, permission: string): boolean {
  const permissions = rolePermissions[role];

  // Check for wildcard permission
  if (permissions.includes('*') || permissions.includes(`${permission.split(':')[0]}:*`)) {
    return true;
  }

  return permissions.includes(permission);
}

// JWT authentication middleware
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Skip auth for setup, login, refresh and logout endpoints
    const skipAuthPaths = [
      '/api/auth/setup',
      '/api/auth/login',
      '/api/auth/setup-status',
      '/api/auth/refresh',
      '/api/auth/logout',
      '/api/health',
      '/healthz',
    ];

    if (skipAuthPaths.some((p) => request.url.startsWith(p))) {
      return;
    }

    // Get token from Authorization header
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({
        success: false,
        error: 'Missing or invalid authorization header',
      });
      return;
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = request.server.jwt.verify(token) as {
      id: string;
      username: string;
      role: UserRole;
    };

    // Attach user to request
    request.user = decoded;
  } catch (error) {
    reply.status(401).send({
      success: false,
      error: 'Invalid or expired token',
    });
  }
}

// RBAC middleware factory
export function requirePermission(permission: string) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!getUser(request)) {
      reply.status(401).send({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    if (!hasPermission(getUser(request)!.role, permission)) {
      reply.status(403).send({
        success: false,
        error: 'Insufficient permissions',
      });
      return;
    }
  };
}

// Admin only middleware
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    reply.status(401).send({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  if (getUser(request)!.role !== 'admin') {
    reply.status(403).send({
      success: false,
      error: 'Admin access required',
    });
    return;
  }
}

// Map routes to permissions
export const routePermissions: Record<string, string> = {
  // Containers
  'GET:/api/containers': 'containers:list',
  'POST:/api/containers': 'containers:create',
  'GET:/api/containers/:id': 'containers:get',
  'POST:/api/containers/:id/start': 'containers:start',
  'POST:/api/containers/:id/stop': 'containers:stop',
  'POST:/api/containers/:id/restart': 'containers:restart',
  'POST:/api/containers/:id/kill': 'containers:kill',
  'DELETE:/api/containers/:id': 'containers:delete',
  'POST:/api/containers/:id/rename': 'containers:update',
  'GET:/api/containers/:id/logs': 'containers:logs',
  'GET:/api/containers/:id/stats': 'containers:stats',
  'GET:/api/containers/:id/inspect': 'containers:get',
  'POST:/api/containers/prune': 'containers:delete',
  'POST:/api/containers/:id/exec': 'containers:exec',

  // Images
  'GET:/api/images': 'images:list',
  'POST:/api/images/pull': 'images:pull',
  'GET:/api/images/:id': 'images:get',
  'POST:/api/images/:id/tag': 'images:update',
  'DELETE:/api/images/:id': 'images:delete',
  'GET:/api/images/:id/history': 'images:history',
  'POST:/api/images/prune': 'images:delete',

  // Volumes
  'GET:/api/volumes': 'volumes:list',
  'POST:/api/volumes': 'volumes:create',
  'GET:/api/volumes/:name': 'volumes:get',
  'DELETE:/api/volumes/:name': 'volumes:delete',
  'POST:/api/volumes/prune': 'volumes:delete',

  // Networks
  'GET:/api/networks': 'networks:list',
  'POST:/api/networks': 'networks:create',
  'GET:/api/networks/:id': 'networks:get',
  'DELETE:/api/networks/:id': 'networks:delete',
  'POST:/api/networks/:id/connect': 'networks:update',
  'POST:/api/networks/:id/disconnect': 'networks:update',
  'POST:/api/networks/prune': 'networks:delete',

  // Builds
  'POST:/api/builds': 'builds:create',
  'GET:/api/builds': 'builds:get',
  'GET:/api/builds/:id/status': 'builds:get',
  'GET:/api/builds/:id/logs': 'builds:get',

  // Compose
  'GET:/api/compose/stacks': 'compose:list',
  'POST:/api/compose/validate': 'compose:create',
  'POST:/api/compose/up': 'compose:up',
  'POST:/api/compose/down': 'compose:down',
  'GET:/api/compose/:name/logs': 'compose:logs',
  'DELETE:/api/compose/:name': 'compose:delete',

  // System (Docker)
  'GET:/api/info': 'system:read',
  'GET:/api/version': 'system:read',
  'GET:/api/df': 'system:read',
  'GET:/api/ping': 'system:read',

  // System (DockPilot)
  'GET:/api/system/version': 'system:read',
  'GET:/api/system/check-update': 'system:read',
  'GET:/api/system/settings': 'settings:read',
  'PUT:/api/system/settings': 'settings:update',
  'POST:/api/system/upgrade': 'settings:update',
  'GET:/api/system/upgrade-status': 'system:read',

  // Users
  'GET:/api/users': 'users:list',
  'POST:/api/users': 'users:create',
  'GET:/api/users/:id': 'users:get',
  'PUT:/api/users/:id': 'users:update',
  'DELETE:/api/users/:id': 'users:delete',
  'POST:/api/users/:id/change-role': 'users:update',
  'POST:/api/users/:id/reset-password': 'users:update',

  // Tunnels
  'GET:/api/tunnels': 'tunnels:list',
  'POST:/api/tunnels': 'tunnels:create',
  'GET:/api/tunnels/:id': 'tunnels:get',
  'DELETE:/api/tunnels/:id': 'tunnels:delete',
  'POST:/api/tunnels/:id/start': 'tunnels:start',
  'POST:/api/tunnels/:id/stop': 'tunnels:stop',
  'GET:/api/tunnels/:id/logs': 'tunnels:get',
  'POST:/api/tunnels/:id/ingress': 'tunnels:update',
};

// Permission middleware for routes
export async function routePermissionMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip for auth routes
  if (request.url.startsWith('/api/auth') || request.url.startsWith('/api/health') || request.url === '/healthz') {
    return;
  }

  if (!request.user) {
    reply.status(401).send({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  // Find matching permission
  const method = request.method;
  const url = request.url.split('?')[0];

  // Try exact match first
  let permission = routePermissions[`${method}:${url}`];

  // Try pattern match for parameterized routes
  if (!permission) {
    for (const [pattern, perm] of Object.entries(routePermissions)) {
      const [patternMethod, patternPath] = pattern.split(':');
      if (patternMethod === method) {
        // Convert pattern to regex
        const regex = new RegExp('^' + patternPath.replace(/:[^/]+/g, '[^/]+') + '$');
        if (regex.test(url)) {
          permission = perm;
          break;
        }
      }
    }
  }

    if (permission && !hasPermission(getUser(request)!.role, permission)) {
    reply.status(403).send({
      success: false,
      error: 'Insufficient permissions',
    });
    return;
  }
}
