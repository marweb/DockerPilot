import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { mkdir, readFile, writeFile, rm, access } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import {
  createHash,
  createHmac,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from 'crypto';
import {
  emitDeployStarted,
  emitDeploySuccess,
  emitDeployFailed,
  emitWebhookReceived,
} from '../services/eventDispatcher.js';

const REPOS_DIR = process.env.REPOS_DIR || '/data/repos';
const REPOS_META = path.join(REPOS_DIR, 'repositories.json');
const OAUTH_META = path.join(REPOS_DIR, 'oauth-connections.json');
const WEBHOOK_META = path.join(REPOS_DIR, 'webhook-deliveries.json');
const PROJECTS_DIR = path.join(REPOS_DIR, 'projects');
const KEYS_DIR = path.join(REPOS_DIR, 'keys');
const NAME_REGEX = /^[a-z0-9][a-z0-9_-]{1,62}$/;

type RepoAuthType = 'none' | 'ssh' | 'https_token';

interface RepoRecord {
  id: string;
  name: string;
  provider: 'github' | 'gitlab' | 'generic';
  repoUrl: string;
  branch: string;
  composePath: string;
  visibility: 'public' | 'private';
  authType: RepoAuthType;
  httpsToken?: string;
  oauthConnectionId?: string;
  autoDeploy: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
  webhookEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface OAuthConnection {
  id: string;
  provider: 'github' | 'gitlab';
  username: string;
  externalId?: string;
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface WebhookDeliveryStore {
  github: Record<string, string>;
  gitlab: Record<string, string>;
}

interface RepoSecretsMigrationResult {
  repos: RepoRecord[];
  changed: boolean;
}

interface ConnectionSecretsMigrationResult {
  connections: OAuthConnection[];
  changed: boolean;
}

const createRepoBody = z.object({
  name: z.string().min(2),
  provider: z.enum(['github', 'gitlab', 'generic']).default('generic'),
  repoUrl: z.string().url(),
  branch: z.string().default('main'),
  composePath: z.string().default('docker-compose.yml'),
  visibility: z.enum(['public', 'private']).default('public'),
  authType: z.enum(['none', 'ssh', 'https_token']).default('none'),
  httpsToken: z.string().optional(),
  oauthConnectionId: z.string().optional(),
  autoDeploy: z.boolean().default(false),
  webhookEnabled: z.boolean().default(false),
  webhookSecret: z.string().optional(),
});

const updateRepoWebhookBody = z.object({
  webhookEnabled: z.boolean(),
  webhookSecret: z.string().optional(),
});

const updateRepoBody = createRepoBody.partial();

const deployRepoBody = z.object({
  stackName: z.string().optional(),
  env: z.record(z.string()).optional(),
  build: z.boolean().default(false),
  removeOrphans: z.boolean().default(true),
});

const githubDevicePollBody = z.object({
  deviceCode: z.string(),
});

const gitlabDevicePollBody = z.object({
  deviceCode: z.string(),
});

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

function hasPublicEndpointConfigured(): boolean {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || '';
  return Boolean(publicBaseUrl && /^https?:\/\//.test(publicBaseUrl));
}

function getMasterKey(): string | null {
  const key = process.env.MASTER_KEY?.trim() || null;
  if (process.env.NODE_ENV === 'production' && !key) {
    throw new Error('MASTER_KEY is required in production for secret encryption');
  }
  return key;
}

function deriveEncryptionKey(masterKey: string): Buffer {
  return createHash('sha256').update(masterKey).digest();
}

function encryptSecret(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('enc:')) return value;
  const masterKey = getMasterKey();
  if (!masterKey) {
    return value;
  }

  const iv = randomBytes(12);
  const key = deriveEncryptionKey(masterKey);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(value?: string): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith('enc:')) return value;

  const masterKey = getMasterKey();
  if (!masterKey) {
    throw new Error('Encrypted secret found but MASTER_KEY is not configured');
  }

  const [, ivB64, tagB64, payloadB64] = value.split(':');
  if (!ivB64 || !tagB64 || !payloadB64) {
    throw new Error('Invalid encrypted secret payload');
  }

  const key = deriveEncryptionKey(masterKey);
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const payload = Buffer.from(payloadB64, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString('utf-8');
}

async function ensureReposDir() {
  getMasterKey();
  await mkdir(REPOS_DIR, { recursive: true });
  await mkdir(PROJECTS_DIR, { recursive: true });
  await mkdir(KEYS_DIR, { recursive: true });
  if (!existsSync(REPOS_META)) {
    await writeFile(REPOS_META, '[]', 'utf-8');
  }
  if (!existsSync(OAUTH_META)) {
    await writeFile(OAUTH_META, '[]', 'utf-8');
  }
  if (!existsSync(WEBHOOK_META)) {
    const empty: WebhookDeliveryStore = { github: {}, gitlab: {} };
    await writeFile(WEBHOOK_META, JSON.stringify(empty, null, 2), 'utf-8');
  }
}

async function loadRepos(): Promise<RepoRecord[]> {
  await ensureReposDir();
  const content = await readFile(REPOS_META, 'utf-8');
  try {
    const parsed = JSON.parse(content) as RepoRecord[];
    const { repos, changed } = migrateRepoSecrets(parsed);
    if (changed) {
      await saveRepos(repos);
    }
    return repos;
  } catch {
    return [];
  }
}

async function saveRepos(repos: RepoRecord[]) {
  await ensureReposDir();
  await writeFile(REPOS_META, JSON.stringify(repos, null, 2), 'utf-8');
}

async function loadConnections(): Promise<OAuthConnection[]> {
  await ensureReposDir();
  const content = await readFile(OAUTH_META, 'utf-8');
  try {
    const parsed = JSON.parse(content) as OAuthConnection[];
    const { connections, changed } = migrateConnectionSecrets(parsed);
    if (changed) {
      await saveConnections(connections);
    }
    return connections;
  } catch {
    return [];
  }
}

async function saveConnections(connections: OAuthConnection[]) {
  await ensureReposDir();
  await writeFile(OAUTH_META, JSON.stringify(connections, null, 2), 'utf-8');
}

async function loadWebhookDeliveries(): Promise<WebhookDeliveryStore> {
  await ensureReposDir();
  const content = await readFile(WEBHOOK_META, 'utf-8');
  try {
    const parsed = JSON.parse(content) as WebhookDeliveryStore;
    return {
      github: parsed.github || {},
      gitlab: parsed.gitlab || {},
    };
  } catch {
    return { github: {}, gitlab: {} };
  }
}

async function saveWebhookDeliveries(store: WebhookDeliveryStore) {
  await ensureReposDir();
  const now = Date.now();
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;

  const prune = (entries: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(entries).filter(([, value]) => {
        const timestamp = Date.parse(value);
        return Number.isFinite(timestamp) && timestamp >= cutoff;
      })
    );

  await writeFile(
    WEBHOOK_META,
    JSON.stringify(
      {
        github: prune(store.github),
        gitlab: prune(store.gitlab),
      },
      null,
      2
    ),
    'utf-8'
  );
}

function getRepoDir(id: string): string {
  return path.join(PROJECTS_DIR, id);
}

function getRepoKeyPath(id: string): string {
  return path.join(KEYS_DIR, `id_${id}`);
}

function toSafeRepo(repo: RepoRecord) {
  const { httpsToken, webhookSecret, ...safe } = repo;
  return {
    ...safe,
    hasHttpsToken: Boolean(httpsToken),
    hasWebhookSecret: Boolean(webhookSecret),
  };
}

function toSafeConnection(connection: OAuthConnection) {
  return {
    id: connection.id,
    provider: connection.provider,
    username: connection.username,
    externalId: connection.externalId,
    scope: connection.scope,
    expiresAt: connection.expiresAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

function execute(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: options?.cwd,
      env: options?.env || process.env,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });
  });
}

function buildAuthedUrl(repo: RepoRecord): string {
  if (repo.authType !== 'https_token' || !repo.httpsToken) {
    return repo.repoUrl;
  }

  const url = new URL(repo.repoUrl);
  const username = repo.provider === 'github' ? 'x-access-token' : 'oauth2';
  url.username = username;
  url.password = decryptSecret(repo.httpsToken) || '';
  return url.toString();
}

function canonicalRepoUrl(input: string): string {
  const trimmed = input.trim();

  if (trimmed.startsWith('git@')) {
    const match = trimmed.match(/^git@([^:]+):(.+)$/);
    if (!match) return trimmed.toLowerCase();
    const host = match[1].toLowerCase();
    const repoPath = match[2].replace(/\.git$/i, '').toLowerCase();
    return `${host}/${repoPath}`;
  }

  try {
    const url = new URL(trimmed);
    const cleanPath = url.pathname
      .replace(/^\//, '')
      .replace(/\.git$/i, '')
      .toLowerCase();
    return `${url.host.toLowerCase()}/${cleanPath}`;
  } catch {
    return trimmed.toLowerCase().replace(/\.git$/i, '');
  }
}

function migrateRepoSecrets(repos: RepoRecord[]): RepoSecretsMigrationResult {
  let changed = false;

  const migrated = repos.map((repo) => {
    if (!repo.httpsToken || repo.httpsToken.startsWith('enc:')) {
      return repo;
    }

    const encryptedToken = encryptSecret(repo.httpsToken);
    if (!encryptedToken || encryptedToken === repo.httpsToken) {
      return repo;
    }

    changed = true;
    return {
      ...repo,
      httpsToken: encryptedToken,
    };
  });

  return { repos: migrated, changed };
}

function migrateConnectionSecrets(
  connections: OAuthConnection[]
): ConnectionSecretsMigrationResult {
  let changed = false;

  const migrated = connections.map((connection) => {
    const nextAccessToken =
      connection.accessToken && !connection.accessToken.startsWith('enc:')
        ? encryptSecret(connection.accessToken)
        : connection.accessToken;
    const nextRefreshToken =
      connection.refreshToken && !connection.refreshToken.startsWith('enc:')
        ? encryptSecret(connection.refreshToken)
        : connection.refreshToken;

    if (
      nextAccessToken === connection.accessToken &&
      nextRefreshToken === connection.refreshToken
    ) {
      return connection;
    }

    changed = true;
    return {
      ...connection,
      accessToken: nextAccessToken || connection.accessToken,
      refreshToken: nextRefreshToken,
    };
  });

  return { connections: migrated, changed };
}

function extractBranchFromRef(ref?: string): string | null {
  if (!ref) return null;
  const match = ref.match(/^refs\/heads\/(.+)$/);
  return match ? match[1] : null;
}

async function deployRepoRecord(
  repo: RepoRecord,
  options?: {
    stackName?: string;
    env?: Record<string, string>;
    build?: boolean;
    removeOrphans?: boolean;
  }
) {
  await syncRepo(repo);
  const repoDir = getRepoDir(repo.id);
  const composeFile = path.join(repoDir, repo.composePath);
  await access(composeFile);

  const stackName = normalizeName(options?.stackName || repo.name);
  if (!NAME_REGEX.test(stackName)) {
    throw new Error('Invalid stack name');
  }

  const envEntries = options?.env || {};
  const deployEnvFile = path.join(repoDir, '.dockpilot.deploy.env');
  const envContent = `${Object.entries(envEntries)
    .map(([key, value]) => `${key}=${value.replace(/\n/g, '\\n')}`)
    .join('\n')}\n`;
  await writeFile(deployEnvFile, envContent, 'utf-8');

  const args = [
    'compose',
    '-f',
    composeFile,
    '--project-name',
    stackName,
    '--env-file',
    deployEnvFile,
    'up',
    '-d',
  ];
  if (options?.build) args.push('--build');
  if (options?.removeOrphans ?? true) args.push('--remove-orphans');

  const up = await execute('docker', args, { cwd: repoDir });
  if (up.exitCode !== 0) {
    throw new Error(up.stderr || 'Failed to deploy repository');
  }

  return {
    stackName,
    output: up.stdout,
  };
}

function verifyGithubSignature(payload: string, signatureHeader: string | undefined): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('GITHUB_WEBHOOK_SECRET is not configured');
  }

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const digest = createHmac('sha256', secret).update(payload).digest('hex');
  const expected = Buffer.from(`sha256=${digest}`);
  const actual = Buffer.from(signatureHeader);
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

function verifyGitlabToken(tokenHeader: string | undefined): boolean {
  const secret = process.env.GITLAB_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('GITLAB_WEBHOOK_SECRET is not configured');
  }
  return Boolean(tokenHeader && tokenHeader === secret);
}

async function ensureSshKey(repo: RepoRecord) {
  const keyPath = getRepoKeyPath(repo.id);
  if (existsSync(keyPath) && existsSync(`${keyPath}.pub`)) {
    return;
  }

  await execute('ssh-keygen', [
    '-t',
    'ed25519',
    '-f',
    keyPath,
    '-q',
    '-N',
    '',
    '-C',
    `dockpilot-${repo.id}`,
  ]);
}

async function getGitEnv(repo: RepoRecord): Promise<NodeJS.ProcessEnv> {
  if (repo.authType !== 'ssh') {
    return process.env;
  }

  await ensureSshKey(repo);
  const keyPath = getRepoKeyPath(repo.id);

  return {
    ...process.env,
    GIT_SSH_COMMAND: `ssh -i ${keyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`,
  };
}

async function syncRepo(repo: RepoRecord) {
  const repoDir = getRepoDir(repo.id);
  const authedUrl = buildAuthedUrl(repo);
  const env = await getGitEnv(repo);

  if (!existsSync(path.join(repoDir, '.git'))) {
    await rm(repoDir, { recursive: true, force: true });
    await mkdir(repoDir, { recursive: true });
    const clone = await execute('git', ['clone', '--branch', repo.branch, authedUrl, repoDir], {
      env,
    });
    if (clone.exitCode !== 0) {
      throw new Error(clone.stderr || 'Failed to clone repository');
    }
    return;
  }

  const remoteSet = await execute('git', ['remote', 'set-url', 'origin', authedUrl], {
    cwd: repoDir,
    env,
  });
  if (remoteSet.exitCode !== 0) {
    throw new Error(remoteSet.stderr || 'Failed to update repository remote');
  }

  const fetch = await execute('git', ['fetch', '--all', '--prune'], { cwd: repoDir, env });
  if (fetch.exitCode !== 0) {
    throw new Error(fetch.stderr || 'Failed to fetch repository');
  }

  const checkout = await execute('git', ['checkout', repo.branch], { cwd: repoDir, env });
  if (checkout.exitCode !== 0) {
    const create = await execute('git', ['checkout', '-B', repo.branch, `origin/${repo.branch}`], {
      cwd: repoDir,
      env,
    });
    if (create.exitCode !== 0) {
      throw new Error(create.stderr || `Failed to checkout branch ${repo.branch}`);
    }
  }

  const reset = await execute('git', ['reset', '--hard', `origin/${repo.branch}`], {
    cwd: repoDir,
    env,
  });
  if (reset.exitCode !== 0) {
    throw new Error(reset.stderr || `Failed to reset branch ${repo.branch}`);
  }
}

export async function repoRoutes(fastify: FastifyInstance) {
  fastify.get('/repos/oauth/connections', async (_request, reply) => {
    const connections = await loadConnections();
    return reply.send({
      success: true,
      data: connections.map(toSafeConnection),
    });
  });

  fastify.post('/repos/oauth/github/device/start', async (_request, reply) => {
    const clientId = process.env.GITHUB_APP_CLIENT_ID;
    if (!clientId) {
      return reply.status(400).send({
        success: false,
        error: 'GITHUB_APP_CLIENT_ID is not configured',
      });
    }

    const params = new URLSearchParams();
    params.set('client_id', clientId);
    params.set('scope', 'repo read:user');

    const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok || payload.error) {
      return reply.status(400).send({
        success: false,
        error: String(
          payload.error_description || payload.error || 'Unable to start GitHub device flow'
        ),
      });
    }

    return reply.send({ success: true, data: payload });
  });

  fastify.post<{ Body: z.infer<typeof githubDevicePollBody> }>(
    '/repos/oauth/github/device/poll',
    { schema: { body: githubDevicePollBody } },
    async (request, reply) => {
      const clientId = process.env.GITHUB_APP_CLIENT_ID;
      if (!clientId) {
        return reply.status(400).send({
          success: false,
          error: 'GITHUB_APP_CLIENT_ID is not configured',
        });
      }

      const params = new URLSearchParams();
      params.set('client_id', clientId);
      params.set('device_code', request.body.deviceCode);
      params.set('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');

      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });
      const tokenPayload = (await tokenResponse.json()) as Record<string, unknown>;

      if (tokenPayload.error) {
        return reply.send({
          success: true,
          data: {
            pending: true,
            error: tokenPayload.error,
            errorDescription: tokenPayload.error_description,
          },
        });
      }

      if (!tokenResponse.ok || !tokenPayload.access_token) {
        return reply.status(400).send({
          success: false,
          error: String(tokenPayload.error_description || 'Unable to complete GitHub device flow'),
        });
      }

      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${String(tokenPayload.access_token)}`,
          'User-Agent': 'DockPilot',
        },
      });
      const userPayload = (await userResponse.json()) as Record<string, unknown>;
      if (!userResponse.ok) {
        return reply.status(400).send({
          success: false,
          error: String(userPayload.message || 'Unable to read GitHub user profile'),
        });
      }

      const connections = await loadConnections();
      const now = new Date().toISOString();
      const username = String(userPayload.login || 'github-user');
      const existing = connections.find(
        (connection) => connection.provider === 'github' && connection.username === username
      );

      const nextConnection: OAuthConnection = {
        id: existing?.id || crypto.randomUUID(),
        provider: 'github',
        username,
        externalId: String(userPayload.id || ''),
        accessToken: encryptSecret(String(tokenPayload.access_token)) || '',
        scope: String(tokenPayload.scope || ''),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      const nextConnections = existing
        ? connections.map((connection) =>
            connection.id === existing.id ? nextConnection : connection
          )
        : [...connections, nextConnection];
      await saveConnections(nextConnections);

      return reply.send({
        success: true,
        data: {
          pending: false,
          connection: toSafeConnection(nextConnection),
        },
      });
    }
  );

  fastify.post('/repos/oauth/gitlab/device/start', async (_request, reply) => {
    const clientId = process.env.GITLAB_OAUTH_CLIENT_ID;
    const baseUrl = process.env.GITLAB_BASE_URL;
    if (!clientId || !baseUrl) {
      return reply.status(400).send({
        success: false,
        error: 'GITLAB_OAUTH_CLIENT_ID and GITLAB_BASE_URL are required',
      });
    }

    const params = new URLSearchParams();
    params.set('client_id', clientId);
    params.set('scope', 'read_user read_repository');

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/oauth/authorize_device`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok || payload.error) {
      return reply.status(400).send({
        success: false,
        error: String(
          payload.error_description || payload.error || 'Unable to start GitLab device flow'
        ),
      });
    }

    return reply.send({ success: true, data: payload });
  });

  fastify.post<{ Body: z.infer<typeof gitlabDevicePollBody> }>(
    '/repos/oauth/gitlab/device/poll',
    { schema: { body: gitlabDevicePollBody } },
    async (request, reply) => {
      const clientId = process.env.GITLAB_OAUTH_CLIENT_ID;
      const baseUrl = process.env.GITLAB_BASE_URL;
      if (!clientId || !baseUrl) {
        return reply.status(400).send({
          success: false,
          error: 'GITLAB_OAUTH_CLIENT_ID and GITLAB_BASE_URL are required',
        });
      }

      const params = new URLSearchParams();
      params.set('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
      params.set('device_code', request.body.deviceCode);
      params.set('client_id', clientId);

      const tokenResponse = await fetch(`${baseUrl.replace(/\/$/, '')}/oauth/token`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      const tokenPayload = (await tokenResponse.json()) as Record<string, unknown>;
      if (tokenPayload.error) {
        return reply.send({
          success: true,
          data: {
            pending: true,
            error: tokenPayload.error,
            errorDescription: tokenPayload.error_description,
          },
        });
      }

      if (!tokenResponse.ok || !tokenPayload.access_token) {
        return reply.status(400).send({
          success: false,
          error: String(tokenPayload.error_description || 'Unable to complete GitLab device flow'),
        });
      }

      const userResponse = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v4/user`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${String(tokenPayload.access_token)}`,
        },
      });
      const userPayload = (await userResponse.json()) as Record<string, unknown>;
      if (!userResponse.ok) {
        return reply.status(400).send({
          success: false,
          error: String(userPayload.message || 'Unable to read GitLab user profile'),
        });
      }

      const now = new Date().toISOString();
      const connections = await loadConnections();
      const username = String(userPayload.username || 'gitlab-user');
      const existing = connections.find(
        (connection) => connection.provider === 'gitlab' && connection.username === username
      );

      const expiresIn = Number(tokenPayload.expires_in || 0);
      const expiresAt =
        expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined;

      const nextConnection: OAuthConnection = {
        id: existing?.id || crypto.randomUUID(),
        provider: 'gitlab',
        username,
        externalId: String(userPayload.id || ''),
        accessToken: encryptSecret(String(tokenPayload.access_token)) || '',
        refreshToken: tokenPayload.refresh_token
          ? encryptSecret(String(tokenPayload.refresh_token))
          : undefined,
        scope: String(tokenPayload.scope || ''),
        expiresAt,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      const nextConnections = existing
        ? connections.map((connection) =>
            connection.id === existing.id ? nextConnection : connection
          )
        : [...connections, nextConnection];
      await saveConnections(nextConnections);

      return reply.send({
        success: true,
        data: {
          pending: false,
          connection: toSafeConnection(nextConnection),
        },
      });
    }
  );

  fastify.post('/repos/webhooks/github', async (request, reply) => {
    if (!hasPublicEndpointConfigured()) {
      return reply.status(400).send({
        success: false,
        error: 'Webhook endpoint requires a publicly reachable PUBLIC_BASE_URL',
      });
    }

    const deliveryId =
      (request.headers['x-github-delivery'] as string | undefined) ||
      `sha-${createHash('sha256')
        .update(JSON.stringify(request.body || {}))
        .digest('hex')}`;
    const event = (request.headers['x-github-event'] as string | undefined) || 'unknown';
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    const payloadRaw = JSON.stringify(request.body || {});

    try {
      if (!verifyGithubSignature(payloadRaw, signature)) {
        return reply
          .status(401)
          .send({ success: false, error: 'Invalid GitHub webhook signature' });
      }
    } catch (error) {
      return reply.status(400).send({ success: false, error: (error as Error).message });
    }

    const deliveryStore = await loadWebhookDeliveries();
    if (deliveryStore.github[deliveryId]) {
      return reply.send({ success: true, data: { duplicate: true, deliveryId } });
    }

    deliveryStore.github[deliveryId] = new Date().toISOString();
    await saveWebhookDeliveries(deliveryStore);

    if (event !== 'push') {
      return reply.send({
        success: true,
        data: { ignored: true, reason: `Event '${event}' not handled` },
      });
    }

    const body = request.body as {
      ref?: string;
      repository?: {
        clone_url?: string;
        ssh_url?: string;
        html_url?: string;
      };
    };

    // Emit webhook received event (fire-and-forget)
    const repoName = body.repository?.clone_url || body.repository?.html_url || 'unknown';
    try {
      await emitWebhookReceived('github', repoName, event);
    } catch (error) {
      fastify.log.warn({ error }, 'Failed to emit webhook received event');
    }

    const branch = extractBranchFromRef(body.ref);
    const repoCandidates = [
      body.repository?.clone_url,
      body.repository?.ssh_url,
      body.repository?.html_url,
    ]
      .filter(Boolean)
      .map((value) => canonicalRepoUrl(String(value)));

    const repos = await loadRepos();
    const targetRepo = repos.find((repo) => {
      if (!repo.autoDeploy) return false;
      if (!branch) return false;
      const sameBranch = repo.branch === branch;
      return sameBranch && repoCandidates.includes(canonicalRepoUrl(repo.repoUrl));
    });

    if (!targetRepo) {
      return reply.send({
        success: true,
        data: {
          handled: false,
          reason: 'No matching autoDeploy repository for this push event',
          branch,
        },
      });
    }

    try {
      const deployment = await deployRepoRecord(targetRepo, {
        stackName: targetRepo.name,
        removeOrphans: true,
      });

      return reply.send({
        success: true,
        data: {
          handled: true,
          provider: 'github',
          repoId: targetRepo.id,
          stackName: deployment.stackName,
        },
      });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: (error as Error).message,
        data: {
          provider: 'github',
          repoId: targetRepo.id,
        },
      });
    }
  });

  fastify.post('/repos/webhooks/gitlab', async (request, reply) => {
    if (!hasPublicEndpointConfigured()) {
      return reply.status(400).send({
        success: false,
        error: 'Webhook endpoint requires a publicly reachable PUBLIC_BASE_URL',
      });
    }

    const webhookToken = request.headers['x-gitlab-token'] as string | undefined;
    const event = (request.headers['x-gitlab-event'] as string | undefined) || 'unknown';
    const deliveryId =
      (request.headers['x-gitlab-event-uuid'] as string | undefined) ||
      (request.headers['x-request-id'] as string | undefined) ||
      `sha-${createHash('sha256')
        .update(JSON.stringify(request.body || {}))
        .digest('hex')}`;

    try {
      if (!verifyGitlabToken(webhookToken)) {
        return reply.status(401).send({ success: false, error: 'Invalid GitLab webhook token' });
      }
    } catch (error) {
      return reply.status(400).send({ success: false, error: (error as Error).message });
    }

    const deliveryStore = await loadWebhookDeliveries();
    if (deliveryStore.gitlab[deliveryId]) {
      return reply.send({ success: true, data: { duplicate: true, deliveryId } });
    }

    deliveryStore.gitlab[deliveryId] = new Date().toISOString();
    await saveWebhookDeliveries(deliveryStore);

    if (event !== 'Push Hook') {
      return reply.send({
        success: true,
        data: { ignored: true, reason: `Event '${event}' not handled` },
      });
    }

    const body = request.body as {
      ref?: string;
      project?: {
        git_http_url?: string;
        git_ssh_url?: string;
        web_url?: string;
      };
    };

    // Emit webhook received event (fire-and-forget)
    const repoName = body.project?.git_http_url || body.project?.web_url || 'unknown';
    try {
      await emitWebhookReceived('gitlab', repoName, event);
    } catch (error) {
      fastify.log.warn({ error }, 'Failed to emit webhook received event');
    }

    const branch = extractBranchFromRef(body.ref);
    const repoCandidates = [
      body.project?.git_http_url,
      body.project?.git_ssh_url,
      body.project?.web_url,
    ]
      .filter(Boolean)
      .map((value) => canonicalRepoUrl(String(value)));

    const repos = await loadRepos();
    const targetRepo = repos.find((repo) => {
      if (!repo.autoDeploy) return false;
      if (!branch) return false;
      const sameBranch = repo.branch === branch;
      return sameBranch && repoCandidates.includes(canonicalRepoUrl(repo.repoUrl));
    });

    if (!targetRepo) {
      return reply.send({
        success: true,
        data: {
          handled: false,
          reason: 'No matching autoDeploy repository for this push event',
          branch,
        },
      });
    }

    try {
      const deployment = await deployRepoRecord(targetRepo, {
        stackName: targetRepo.name,
        removeOrphans: true,
      });

      return reply.send({
        success: true,
        data: {
          handled: true,
          provider: 'gitlab',
          repoId: targetRepo.id,
          stackName: deployment.stackName,
        },
      });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: (error as Error).message,
        data: {
          provider: 'gitlab',
          repoId: targetRepo.id,
        },
      });
    }
  });

  fastify.get('/repos', async (_request, reply) => {
    const repos = await loadRepos();
    return reply.send({
      success: true,
      data: repos.map(toSafeRepo),
    });
  });

  fastify.post<{ Body: z.infer<typeof createRepoBody> }>(
    '/repos',
    { schema: { body: createRepoBody } },
    async (request, reply) => {
      const payload = request.body;
      const name = normalizeName(payload.name);
      if (!NAME_REGEX.test(name)) {
        return reply.status(400).send({
          success: false,
          error: 'Repository name must match ^[a-z0-9][a-z0-9_-]{1,62}$',
        });
      }

      if (payload.visibility === 'private' && payload.authType === 'none') {
        return reply.status(400).send({
          success: false,
          error: 'Private repositories require SSH or HTTPS token auth',
        });
      }

      if (payload.authType === 'https_token' && !payload.httpsToken) {
        return reply.status(400).send({
          success: false,
          error: 'httpsToken is required for https_token auth',
        });
      }

      if (payload.autoDeploy && !hasPublicEndpointConfigured()) {
        return reply.status(400).send({
          success: false,
          error: 'Autodeploy requires a publicly reachable PUBLIC_BASE_URL',
        });
      }

      const repos = await loadRepos();
      if (repos.some((repo) => repo.name === name)) {
        return reply
          .status(409)
          .send({ success: false, error: `Repository '${name}' already exists` });
      }

      const now = new Date().toISOString();
      const publicBaseUrl = process.env.PUBLIC_BASE_URL || '';
      const webhookUrl = publicBaseUrl
        ? `${publicBaseUrl}/api/repos/webhooks/${payload.provider === 'generic' ? 'github' : payload.provider}`
        : undefined;

      const repo: RepoRecord = {
        id: crypto.randomUUID(),
        name,
        provider: payload.provider,
        repoUrl: payload.repoUrl,
        branch: payload.branch,
        composePath: payload.composePath,
        visibility: payload.visibility,
        authType: payload.authType,
        httpsToken: encryptSecret(payload.httpsToken),
        oauthConnectionId: payload.oauthConnectionId,
        autoDeploy: payload.autoDeploy,
        webhookEnabled: payload.webhookEnabled ?? false,
        webhookUrl,
        webhookSecret: payload.webhookSecret ? encryptSecret(payload.webhookSecret) : undefined,
        createdAt: now,
        updatedAt: now,
      };

      repos.push(repo);
      await saveRepos(repos);

      if (repo.authType === 'ssh') {
        await ensureSshKey(repo);
      }

      return reply.send({ success: true, data: toSafeRepo(repo) });
    }
  );

  fastify.get<{ Params: { id: string } }>('/repos/:id', async (request, reply) => {
    const repos = await loadRepos();
    const repo = repos.find((entry) => entry.id === request.params.id);
    if (!repo) {
      return reply.status(404).send({ success: false, error: 'Repository not found' });
    }

    return reply.send({ success: true, data: toSafeRepo(repo) });
  });

  fastify.post<{ Params: { id: string }; Body: z.infer<typeof updateRepoWebhookBody> }>(
    '/repos/:id/webhook',
    { schema: { body: updateRepoWebhookBody } },
    async (request, reply) => {
      const repos = await loadRepos();
      const index = repos.findIndex((entry) => entry.id === request.params.id);
      if (index === -1) {
        return reply.status(404).send({ success: false, error: 'Repository not found' });
      }

      const current = repos[index];

      // Validate public endpoint is configured if enabling webhook
      if (request.body.webhookEnabled && !hasPublicEndpointConfigured()) {
        return reply.status(400).send({
          success: false,
          error: 'Webhook requires a publicly reachable PUBLIC_BASE_URL',
        });
      }

      const updated: RepoRecord = {
        ...current,
        webhookEnabled: request.body.webhookEnabled,
        webhookSecret: request.body.webhookSecret
          ? encryptSecret(request.body.webhookSecret)
          : current.webhookSecret,
        updatedAt: new Date().toISOString(),
      };

      repos[index] = updated;
      await saveRepos(repos);

      return reply.send({ success: true, data: toSafeRepo(updated) });
    }
  );

  fastify.patch<{ Params: { id: string }; Body: z.infer<typeof updateRepoBody> }>(
    '/repos/:id',
    { schema: { body: updateRepoBody } },
    async (request, reply) => {
      const repos = await loadRepos();
      const index = repos.findIndex((entry) => entry.id === request.params.id);
      if (index === -1) {
        return reply.status(404).send({ success: false, error: 'Repository not found' });
      }

      const current = repos[index];
      const nextName = request.body.name ? normalizeName(request.body.name) : current.name;
      if (!NAME_REGEX.test(nextName)) {
        return reply.status(400).send({
          success: false,
          error: 'Repository name must match ^[a-z0-9][a-z0-9_-]{1,62}$',
        });
      }

      if (repos.some((repo) => repo.id !== current.id && repo.name === nextName)) {
        return reply
          .status(409)
          .send({ success: false, error: `Repository '${nextName}' already exists` });
      }

      const nextVisibility = request.body.visibility || current.visibility;
      const nextAuthType = request.body.authType || current.authType;
      const nextHttpsToken =
        request.body.httpsToken ||
        (nextAuthType === 'https_token' ? decryptSecret(current.httpsToken) : '');

      if (nextVisibility === 'private' && nextAuthType === 'none') {
        return reply.status(400).send({
          success: false,
          error: 'Private repositories require SSH or HTTPS token auth',
        });
      }

      if (nextAuthType === 'https_token' && !nextHttpsToken) {
        return reply.status(400).send({
          success: false,
          error: 'httpsToken is required for https_token auth',
        });
      }

      const updated: RepoRecord = {
        ...current,
        ...request.body,
        name: nextName,
        httpsToken:
          request.body.authType === 'https_token'
            ? encryptSecret(request.body.httpsToken || decryptSecret(current.httpsToken))
            : request.body.authType === 'none'
              ? undefined
              : current.httpsToken,
        updatedAt: new Date().toISOString(),
      };

      if (updated.autoDeploy && !hasPublicEndpointConfigured()) {
        return reply.status(400).send({
          success: false,
          error: 'Autodeploy requires a publicly reachable PUBLIC_BASE_URL',
        });
      }

      repos[index] = updated;
      await saveRepos(repos);

      return reply.send({ success: true, data: toSafeRepo(updated) });
    }
  );

  fastify.delete<{ Params: { id: string } }>('/repos/:id', async (request, reply) => {
    const repos = await loadRepos();
    const repo = repos.find((entry) => entry.id === request.params.id);
    if (!repo) {
      return reply.status(404).send({ success: false, error: 'Repository not found' });
    }

    const nextRepos = repos.filter((entry) => entry.id !== repo.id);
    await saveRepos(nextRepos);

    await rm(getRepoDir(repo.id), { recursive: true, force: true });
    await rm(getRepoKeyPath(repo.id), { force: true });
    await rm(`${getRepoKeyPath(repo.id)}.pub`, { force: true });

    return reply.send({ success: true, message: 'Repository removed' });
  });

  fastify.get<{ Params: { id: string } }>('/repos/:id/public-key', async (request, reply) => {
    const repos = await loadRepos();
    const repo = repos.find((entry) => entry.id === request.params.id);
    if (!repo) {
      return reply.status(404).send({ success: false, error: 'Repository not found' });
    }

    if (repo.authType !== 'ssh') {
      return reply
        .status(400)
        .send({ success: false, error: 'SSH auth is not enabled for this repo' });
    }

    await ensureSshKey(repo);
    const publicKey = await readFile(`${getRepoKeyPath(repo.id)}.pub`, 'utf-8');
    return reply.send({ success: true, data: { publicKey } });
  });

  fastify.post<{ Params: { id: string } }>('/repos/:id/test-connection', async (request, reply) => {
    const repos = await loadRepos();
    const repo = repos.find((entry) => entry.id === request.params.id);
    if (!repo) {
      return reply.status(404).send({ success: false, error: 'Repository not found' });
    }

    const env = await getGitEnv(repo);
    const lsRemote = await execute(
      'git',
      ['ls-remote', '--heads', buildAuthedUrl(repo), repo.branch],
      {
        env,
      }
    );

    if (lsRemote.exitCode !== 0) {
      return reply.status(400).send({
        success: false,
        error: lsRemote.stderr || 'Unable to connect to repository',
      });
    }

    return reply.send({ success: true, message: 'Repository connection OK' });
  });

  fastify.post<{ Params: { id: string } }>('/repos/:id/sync', async (request, reply) => {
    const repos = await loadRepos();
    const repo = repos.find((entry) => entry.id === request.params.id);
    if (!repo) {
      return reply.status(404).send({ success: false, error: 'Repository not found' });
    }

    try {
      await syncRepo(repo);
      return reply.send({ success: true, message: 'Repository synced' });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  fastify.post<{ Params: { id: string }; Body: z.infer<typeof deployRepoBody> }>(
    '/repos/:id/deploy',
    {
      schema: { body: deployRepoBody },
    },
    async (request, reply) => {
      const repos = await loadRepos();
      const repo = repos.find((entry) => entry.id === request.params.id);
      if (!repo) {
        return reply.status(404).send({ success: false, error: 'Repository not found' });
      }

      // Emit deploy started event (fire-and-forget)
      try {
        await emitDeployStarted(repo.name, repo.id, repo.branch);
      } catch (error) {
        fastify.log.warn({ error }, 'Failed to emit deploy started event');
      }

      const startTime = Date.now();

      try {
        const deployment = await deployRepoRecord(repo, {
          stackName: request.body.stackName,
          env: request.body.env,
          build: request.body.build,
          removeOrphans: request.body.removeOrphans,
        });

        const duration = Date.now() - startTime;

        // Emit deploy success event (fire-and-forget)
        try {
          await emitDeploySuccess(repo.name, duration, [deployment.stackName]);
        } catch (error) {
          fastify.log.warn({ error }, 'Failed to emit deploy success event');
        }

        return reply.send({
          success: true,
          message: `Repository ${repo.name} deployed to stack ${deployment.stackName}`,
          data: {
            stackName: deployment.stackName,
            output: deployment.output,
          },
        });
      } catch (error) {
        const errorMessage = (error as Error).message;

        // Emit deploy failed event (fire-and-forget)
        try {
          await emitDeployFailed(repo.name, errorMessage, 'deploy');
        } catch (eventError) {
          fastify.log.warn({ error: eventError }, 'Failed to emit deploy failed event');
        }

        return reply.status(400).send({ success: false, error: errorMessage });
      }
    }
  );

  fastify.get('/repos/oauth/status', async (_request, reply) => {
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || '';
    const hasPublicUrl = hasPublicEndpointConfigured();

    return reply.send({
      success: true,
      data: {
        hasPublicUrl,
        publicBaseUrl: hasPublicUrl ? publicBaseUrl : null,
        githubAppConfigured:
          Boolean(process.env.GITHUB_APP_ID) &&
          Boolean(process.env.GITHUB_APP_CLIENT_ID) &&
          Boolean(process.env.GITHUB_APP_CLIENT_SECRET),
        gitlabOAuthConfigured:
          Boolean(process.env.GITLAB_OAUTH_CLIENT_ID) &&
          Boolean(process.env.GITLAB_OAUTH_CLIENT_SECRET) &&
          Boolean(process.env.GITLAB_BASE_URL),
        fallbackMethods: ['ssh', 'https_token'],
      },
    });
  });
}
