import { z } from 'zod';

const configSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('0.0.0.0'),
  corsOrigin: z.string().optional(),
  jwtSecret: z.string().min(32),
  jwtExpiresIn: z.string().default('1h'),
  refreshTokenExpiresIn: z.string().default('14d'),
  dockerControlUrl: z.string().default('http://docker-control:3001'),
  tunnelControlUrl: z.string().default('http://tunnel-control:3002'),
  initialAdminPassword: z.string().optional(),
  dataDir: z.string().default('/data'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  rateLimitMax: z.number().default(100),
  rateLimitWindow: z.string().default('1 minute'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  return configSchema.parse({
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
    host: process.env.HOST,
    corsOrigin: process.env.CORS_ORIGIN,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN,
    dockerControlUrl: process.env.DOCKER_CONTROL_URL,
    tunnelControlUrl: process.env.TUNNEL_CONTROL_URL,
    initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD,
    dataDir: process.env.DATA_DIR,
    logLevel: process.env.LOG_LEVEL,
    rateLimitMax: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : undefined,
    rateLimitWindow: process.env.RATE_LIMIT_WINDOW,
  });
}
