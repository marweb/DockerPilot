import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CreateTunnelSchema,
  ListTunnelsQuerySchema,
  TunnelIdParamSchema,
  type CreateTunnelInput,
  type ListTunnelsQuery,
} from '../schemas/index.js';
import {
  listTunnels,
  createTunnel,
  getTunnel,
  deleteTunnel,
  startTunnel,
  stopTunnel,
  getTunnelStatus,
  getTunnelLogs,
  getTunnelContainerAssociations,
  setTunnelContainerAssociations,
  removeTunnelContainerAssociation,
} from '../services/cloudflared.js';
import { CloudflareAPIError } from '../services/cloudflare-api.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export async function tunnelRoutes(fastify: FastifyInstance) {
  // List tunnels
  fastify.get<{
    Querystring: ListTunnelsQuery;
  }>(
    '/tunnels',
    {
      schema: {
        querystring: ListTunnelsQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        const { status, search } = request.query;
        let tunnels = await listTunnels();

        // Filter by status if provided
        if (status) {
          tunnels = tunnels.filter((t) => t.status === status);
        }

        // Filter by search term if provided
        if (search) {
          const searchLower = search.toLowerCase();
          tunnels = tunnels.filter(
            (t) =>
              t.name.toLowerCase().includes(searchLower) || t.id.toLowerCase().includes(searchLower)
          );
        }

        return reply.send({
          success: true,
          data: tunnels,
          meta: {
            total: tunnels.length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list tunnels');

        if (error instanceof CloudflareAPIError) {
          return reply.status(error.statusCode).send({
            success: false,
            error: { code: 'CLOUDFLARE_ERROR', message: error.message },
          });
        }

        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: (error as Error).message },
        });
      }
    }
  );

  // Create tunnel
  fastify.post<{
    Body: CreateTunnelInput;
  }>(
    '/tunnels',
    {
      schema: {
        body: CreateTunnelSchema,
      },
    },
    async (request, reply) => {
      try {
        const { name, accountId, zoneId } = request.body;
        const tunnel = await createTunnel(name, accountId, zoneId);

        logger.info({ tunnelId: tunnel.id, name }, 'Tunnel created via API');

        return reply.status(201).send({
          success: true,
          data: tunnel,
          message: 'Tunnel created successfully',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to create tunnel');

        if ((error as Error).message.includes('already exists')) {
          return reply.status(409).send({
            success: false,
            error: { code: 'CONFLICT', message: (error as Error).message },
          });
        }

        if ((error as Error).message.includes('Not authenticated')) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: (error as Error).message },
          });
        }

        return reply.status(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: (error as Error).message },
        });
      }
    }
  );

  // Get tunnel
  fastify.get<{
    Params: { id: string };
  }>(
    '/tunnels/:id',
    {
      schema: {
        params: TunnelIdParamSchema,
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const tunnel = await getTunnel(id);

        return reply.send({
          success: true,
          data: tunnel,
        });
      } catch (error) {
        if ((error as Error).message === 'Tunnel not found') {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Tunnel not found' },
          });
        }

        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: (error as Error).message },
        });
      }
    }
  );

  // Delete tunnel
  fastify.delete<{
    Params: { id: string };
  }>(
    '/tunnels/:id',
    {
      schema: {
        params: TunnelIdParamSchema,
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        await deleteTunnel(id);

        logger.info({ tunnelId: id }, 'Tunnel deleted via API');

        return reply.send({
          success: true,
          message: 'Tunnel deleted successfully',
        });
      } catch (error) {
        if ((error as Error).message === 'Tunnel not found') {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Tunnel not found' },
          });
        }

        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: (error as Error).message },
        });
      }
    }
  );

  // Start tunnel
  fastify.post<{
    Params: { id: string };
  }>(
    '/tunnels/:id/start',
    {
      schema: {
        params: TunnelIdParamSchema,
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        await startTunnel(id);

        logger.info({ tunnelId: id }, 'Tunnel started via API');

        return reply.send({
          success: true,
          message: 'Tunnel started successfully',
          data: { tunnelId: id, status: 'active' },
        });
      } catch (error) {
        if ((error as Error).message === 'Tunnel not found') {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Tunnel not found' },
          });
        }

        return reply.status(400).send({
          success: false,
          error: { code: 'START_ERROR', message: (error as Error).message },
        });
      }
    }
  );

  // Stop tunnel
  fastify.post<{
    Params: { id: string };
  }>(
    '/tunnels/:id/stop',
    {
      schema: {
        params: TunnelIdParamSchema,
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        await stopTunnel(id);

        logger.info({ tunnelId: id }, 'Tunnel stopped via API');

        return reply.send({
          success: true,
          message: 'Tunnel stopped successfully',
          data: { tunnelId: id, status: 'inactive' },
        });
      } catch (error) {
        if ((error as Error).message === 'Tunnel not found') {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Tunnel not found' },
          });
        }

        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: (error as Error).message },
        });
      }
    }
  );

  // Get tunnel logs
  fastify.get<{
    Params: { id: string };
    Querystring: { lines?: string };
  }>(
    '/tunnels/:id/logs',
    {
      schema: {
        params: TunnelIdParamSchema,
        querystring: {
          type: 'object',
          properties: {
            lines: { type: 'string', pattern: '^\\d+$' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const lines = parseInt(request.query.lines || '100', 10);
        const logs = await getTunnelLogs(id, lines);

        return reply.send({
          success: true,
          data: {
            tunnelId: id,
            logs,
            lines: logs.length,
          },
        });
      } catch (error) {
        if ((error as Error).message === 'Tunnel not found') {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Tunnel not found' },
          });
        }

        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: (error as Error).message },
        });
      }
    }
  );

  // Get tunnel status
  fastify.get<{
    Params: { id: string };
  }>(
    '/tunnels/:id/status',
    {
      schema: {
        params: TunnelIdParamSchema,
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const status = await getTunnelStatus(id);

        return reply.send({
          success: true,
          data: { tunnelId: id, ...status },
        });
      } catch (error) {
        if ((error as Error).message === 'Tunnel not found') {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Tunnel not found' },
          });
        }

        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: (error as Error).message },
        });
      }
    }
  );

  // List associated containers
  fastify.get<{
    Params: { id: string };
  }>(
    '/tunnels/:id/containers',
    {
      schema: {
        params: TunnelIdParamSchema,
      },
    },
    async (request, reply) => {
      try {
        const containerIds = await getTunnelContainerAssociations(request.params.id);
        return reply.send({
          success: true,
          data: {
            tunnelId: request.params.id,
            containerIds,
          },
        });
      } catch (error) {
        if ((error as Error).message === 'Tunnel not found') {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Tunnel not found' },
          });
        }

        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: (error as Error).message },
        });
      }
    }
  );

  // Replace associated containers
  fastify.put<{
    Params: { id: string };
    Body: { containerIds: string[] };
  }>(
    '/tunnels/:id/containers',
    {
      schema: {
        params: TunnelIdParamSchema,
        body: z.object({
          containerIds: z.array(z.string().min(1)).default([]),
        }),
      },
    },
    async (request, reply) => {
      try {
        const containerIds = await setTunnelContainerAssociations(
          request.params.id,
          request.body.containerIds
        );

        return reply.send({
          success: true,
          message: 'Container associations updated',
          data: {
            tunnelId: request.params.id,
            containerIds,
          },
        });
      } catch (error) {
        if ((error as Error).message === 'Tunnel not found') {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Tunnel not found' },
          });
        }

        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: (error as Error).message },
        });
      }
    }
  );

  // Remove one associated container
  fastify.delete<{
    Params: { id: string; containerId: string };
  }>(
    '/tunnels/:id/containers/:containerId',
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
          containerId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      try {
        const containerIds = await removeTunnelContainerAssociation(
          request.params.id,
          request.params.containerId
        );

        return reply.send({
          success: true,
          message: 'Container association removed',
          data: {
            tunnelId: request.params.id,
            containerIds,
          },
        });
      } catch (error) {
        if ((error as Error).message === 'Tunnel not found') {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Tunnel not found' },
          });
        }

        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: (error as Error).message },
        });
      }
    }
  );
}
