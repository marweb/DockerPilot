import { z } from 'zod';

const configSchema = z.object({
  port: z.number().default(3002),
  host: z.string().default('0.0.0.0'),
  cloudflaredPath: z.string().default('/usr/local/bin/cloudflared'),
  credentialsDir: z.string().default('/data/tunnels'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Process management
  maxRestarts: z.number().default(3),
  restartDelay: z.number().default(5000),

  // Metrics
  metricsPort: z.number().optional(),

  // Security
  masterKey: z.string().optional(),

  // Cloudflare API
  cloudflareApiUrl: z.string().default('https://api.cloudflare.com/client/v4'),

  // Logging
  logFile: z.string().optional(),
  logMaxSize: z.string().default('10m'),
  logMaxFiles: z.number().default(5),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  return configSchema.parse({
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
    host: process.env.HOST,
    cloudflaredPath: process.env.CLOUDFLARED_PATH,
    credentialsDir: process.env.CREDENTIALS_DIR,
    logLevel: process.env.LOG_LEVEL,
    maxRestarts: process.env.MAX_RESTARTS ? parseInt(process.env.MAX_RESTARTS, 10) : undefined,
    restartDelay: process.env.RESTART_DELAY ? parseInt(process.env.RESTART_DELAY, 10) : undefined,
    metricsPort: process.env.METRICS_PORT ? parseInt(process.env.METRICS_PORT, 10) : undefined,
    masterKey: process.env.MASTER_KEY || process.env.ENCRYPTION_KEY,
    cloudflareApiUrl: process.env.CLOUDFLARE_API_URL,
    logFile: process.env.LOG_FILE,
    logMaxSize: process.env.LOG_MAX_SIZE,
    logMaxFiles: process.env.LOG_MAX_FILES ? parseInt(process.env.LOG_MAX_FILES, 10) : undefined,
  });
}
