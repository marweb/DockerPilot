import { z } from 'zod';

export const CreateTunnelSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(63, 'Name must be at most 63 characters')
    .regex(/^[a-z0-9-]+$/, 'Name must contain only lowercase letters, numbers, and hyphens'),
  accountId: z.string().optional(),
  zoneId: z.string().optional(),
  autoStart: z.boolean().optional(),
});

export const UpdateTunnelSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  zoneId: z.string().optional(),
});

export const IngressRuleSchema = z.object({
  hostname: z
    .string()
    .min(1, 'Hostname is required')
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/,
      'Invalid hostname format'
    ),
  service: z
    .string()
    .min(1, 'Service is required')
    .regex(
      /^(http|https|tcp|udp|unix|ssh):\/\/.+/,
      'Service must be a valid URL (http://, https://, tcp://, etc.)'
    ),
  port: z.number().default(80),
  originRequest: z
    .object({
      connectTimeout: z.number().optional(),
      tlsTimeout: z.number().optional(),
      tcpKeepAlive: z.number().optional(),
      noHappyEyeballs: z.boolean().optional(),
      keepAliveConnections: z.number().optional(),
      keepAliveTimeout: z.number().optional(),
      httpHostHeader: z.string().optional(),
      originServerName: z.string().optional(),
      caPool: z.string().optional(),
      noTLSVerify: z.boolean().optional(),
      disableChunkedEncoding: z.boolean().optional(),
      bastionMode: z.boolean().optional(),
      proxyAddress: z.string().optional(),
      proxyPort: z.number().optional(),
      proxyType: z.enum(['socks', 'http']).optional(),
      ipRules: z
        .array(
          z.object({
            prefix: z.string(),
            ports: z.array(z.number()),
            allow: z.boolean(),
          })
        )
        .optional(),
    })
    .optional(),
  path: z.string().optional(),
});

export const UpdateIngressSchema = z.object({
  ingress: z.array(IngressRuleSchema).min(1, 'At least one ingress rule is required'),
});

export const DeleteIngressRuleSchema = z.object({
  hostname: z.string().min(1, 'Hostname is required'),
});

export const CloudflareAuthSchema = z.object({
  apiToken: z
    .string()
    .min(1, 'API Token is required')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid API token format'),
  accountId: z
    .string()
    .min(1, 'Account ID is required')
    .regex(/^[a-f0-9]{32}$/, 'Invalid Account ID format')
    .optional(),
});

export const CloudflareLoginSchema = z.object({
  method: z.enum(['api_token', 'oauth']).optional().default('oauth'),
  apiToken: z.string().optional(),
  accountId: z.string().optional(),
});

export const TunnelIdParamSchema = z.object({
  id: z.string().uuid('Invalid tunnel ID format'),
});

export const ListTunnelsQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
  status: z.enum(['active', 'inactive', 'error', 'creating']).optional(),
  search: z.string().optional(),
});

export type CreateTunnelInput = z.infer<typeof CreateTunnelSchema>;
export type UpdateTunnelInput = z.infer<typeof UpdateTunnelSchema>;
export type IngressRuleInput = z.infer<typeof IngressRuleSchema>;
export type UpdateIngressInput = z.infer<typeof UpdateIngressSchema>;
export type CloudflareAuthInput = z.infer<typeof CloudflareAuthSchema>;
export type CloudflareLoginInput = z.infer<typeof CloudflareLoginSchema>;
export type TunnelIdParam = z.infer<typeof TunnelIdParamSchema>;
export type ListTunnelsQuery = z.infer<typeof ListTunnelsQuerySchema>;
