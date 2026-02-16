import Database from 'better-sqlite3';
import { readFile } from 'fs/promises';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  User,
  UserRole,
  NotificationRule,
  NotificationHistory,
  NotificationRulesMatrix,
} from '@dockpilot/types';

// ES Modules compatibility - define __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = 'dockpilot.db';
const DB_JSON_FILE = 'db.json';

export interface StoredUser extends User {
  passwordHash: string;
  refreshToken?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  username: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip: string;
  userAgent: string;
}

export interface SystemSetting {
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationProvider = 'smtp' | 'resend' | 'slack' | 'telegram' | 'discord';

export interface NotificationChannel {
  id: string;
  provider: NotificationProvider;
  name: string;
  enabled: boolean;
  config: string;
  fromName?: string;
  fromAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationRuleRecord {
  id: string;
  event_type: string;
  channel_id: string;
  enabled: number;
  min_severity: string;
  cooldown_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface NotificationHistoryRecord {
  id: string;
  event_type: string;
  channel_id: string;
  severity: string;
  message: string;
  recipients?: string;
  status: 'pending' | 'sent' | 'failed' | 'retrying';
  error?: string;
  retry_count: number;
  sent_at?: string;
  created_at: string;
}

let db: Database.Database | null = null;
let dataDir = '/data';

let initPromise: Promise<void> | null = null;

export function initDatabase(dataDirectory: string): void {
  dataDir = dataDirectory;
}

function getDbPath(): string {
  return path.join(dataDir, DB_FILE);
}

function getDbJsonPath(): string {
  return path.join(dataDir, DB_JSON_FILE);
}

function ensureDataDir(): void {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

function createSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      refresh_token TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id TEXT,
      details TEXT,
      ip TEXT NOT NULL,
      user_agent TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

    -- Notification channels table (for storing provider configurations)
    CREATE TABLE IF NOT EXISTS notification_channels (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT NOT NULL,
      from_name TEXT,
      from_address TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notification_channels_provider ON notification_channels(provider);
    CREATE INDEX IF NOT EXISTS idx_notification_channels_enabled ON notification_channels(enabled);

    -- System settings table (fallback if migration 002 hasn't run)
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'string',
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Insert default settings
    INSERT OR IGNORE INTO system_settings (key, value, type, description) VALUES
    ('instance_name', 'DockPilot', 'string', 'Instance name'),
    ('public_url', '', 'string', 'Public URL'),
    ('timezone', 'UTC', 'string', 'Timezone'),
    ('public_ipv4', '', 'string', 'Public IPv4'),
    ('public_ipv6', '', 'string', 'Public IPv6'),
    ('auto_update', 'false', 'boolean', 'Auto update');

    -- Notification rules table (managed by migration 003)
    -- Notification history table (managed by migration 003)
  `);
}

async function migrateFromJson(sqlite: Database.Database): Promise<void> {
  const jsonPath = getDbJsonPath();
  if (!existsSync(jsonPath)) return;

  interface JsonDb {
    users?: Array<{
      id: string;
      username: string;
      passwordHash: string;
      role: UserRole;
      refreshToken?: string;
      createdAt: string | Date;
      updatedAt: string | Date;
    }>;
    auditLogs?: Array<{
      id: string;
      timestamp: string;
      userId: string;
      username: string;
      action: string;
      resource: string;
      resourceId?: string;
      details?: Record<string, unknown>;
      ip: string;
      userAgent: string;
    }>;
    setupComplete?: boolean;
  }

  const content = await readFile(jsonPath, 'utf-8');
  const jsonDb: JsonDb = JSON.parse(content);

  const insertMeta = sqlite.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
  insertMeta.run('setup_complete', jsonDb.setupComplete ? '1' : '0');
  insertMeta.run('migrated_from_json', '1');

  if (jsonDb.users?.length) {
    const insertUser = sqlite.prepare(`
      INSERT INTO users (id, username, password_hash, role, refresh_token, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const u of jsonDb.users) {
      const createdAt =
        typeof u.createdAt === 'string' ? u.createdAt : (u.createdAt as Date).toISOString();
      const updatedAt =
        typeof u.updatedAt === 'string' ? u.updatedAt : (u.updatedAt as Date).toISOString();
      insertUser.run(
        u.id,
        u.username,
        u.passwordHash,
        u.role,
        u.refreshToken ?? null,
        createdAt,
        updatedAt
      );
    }
  }

  if (jsonDb.auditLogs?.length) {
    const insertLog = sqlite.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_id, username, action, resource, resource_id, details, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const maxLogs = 10000;
    const logs = jsonDb.auditLogs.slice(-maxLogs);
    for (const l of logs) {
      insertLog.run(
        l.id,
        l.timestamp,
        l.userId,
        l.username,
        l.action,
        l.resource,
        l.resourceId ?? null,
        l.details ? JSON.stringify(l.details) : null,
        l.ip,
        l.userAgent
      );
    }
  }
}

async function runMigrations(sqlite: Database.Database): Promise<void> {
  const migrationsDir = path.join(__dirname, '../migrations');

  if (!existsSync(migrationsDir)) {
    return;
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      executed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const executedMigrations = sqlite.prepare('SELECT filename FROM migrations').all() as Array<{
    filename: string;
  }>;
  const executedSet = new Set(executedMigrations.map((m) => m.filename));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    if (executedSet.has(filename)) {
      continue;
    }

    const filePath = path.join(migrationsDir, filename);
    const sql = await readFile(filePath, 'utf-8');

    const transaction = sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite.prepare('INSERT INTO migrations (filename) VALUES (?)').run(filename);
    });

    transaction();
  }
}

async function initSqlite(): Promise<void> {
  ensureDataDir();
  const dbPath = getDbPath();
  const sqlite = new Database(dbPath);

  sqlite.pragma('journal_mode = WAL');
  createSchema(sqlite);

  const meta = sqlite.prepare('SELECT value FROM meta WHERE key = ?').get('setup_complete') as
    | { value: string }
    | undefined;
  const hasMeta = meta !== undefined;
  const jsonPath = getDbJsonPath();
  const jsonExists = existsSync(jsonPath);

  if (jsonExists && !hasMeta) {
    await migrateFromJson(sqlite);
  } else if (!hasMeta) {
    sqlite.prepare("INSERT INTO meta (key, value) VALUES ('setup_complete', '0')").run();
  }

  await runMigrations(sqlite);

  db = sqlite;
}

export async function getDatabase(): Promise<Database.Database> {
  if (db) return db;
  if (!initPromise) {
    initPromise = initSqlite();
  }
  await initPromise;
  if (!db) throw new Error('Database failed to initialize');
  return db;
}

export async function isSetupComplete(): Promise<boolean> {
  const sqlite = await getDatabase();
  const row = sqlite.prepare('SELECT value FROM meta WHERE key = ?').get('setup_complete') as
    | { value: string }
    | undefined;
  if (!row) return false;
  const userCount = sqlite.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
  return row.value === '1' && userCount.c > 0;
}

export async function completeSetup(): Promise<void> {
  const sqlite = await getDatabase();
  sqlite.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('setup_complete', '1')").run();
}

export async function getSystemSetting(key: string): Promise<string | null> {
  const sqlite = await getDatabase();
  const row = sqlite.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export async function setSystemSetting(key: string, value: string): Promise<void> {
  const sqlite = await getDatabase();
  sqlite.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
}

export async function getSystemSettings(): Promise<Record<string, string>> {
  const sqlite = await getDatabase();
  const rows = sqlite
    .prepare("SELECT key, value FROM meta WHERE key LIKE 'setting_%'")
    .all() as Array<{ key: string; value: string }>;
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key.replace('setting_', '')] = row.value;
  }
  return settings;
}

export async function getSetting(key: string): Promise<SystemSetting | null> {
  const sqlite = await getDatabase();
  const row = sqlite
    .prepare(
      'SELECT key, value, type, description, created_at, updated_at FROM system_settings WHERE key = ?'
    )
    .get(key) as
    | {
        key: string;
        value: string;
        type: string;
        description: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;

  return {
    key: row.key,
    value: row.value,
    type: row.type as SystemSetting['type'],
    description: row.description ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function setSetting(
  key: string,
  value: string,
  type: SystemSetting['type'] = 'string',
  description?: string
): Promise<void> {
  const sqlite = await getDatabase();
  const now = new Date().toISOString();

  const validTypes: SystemSetting['type'][] = ['string', 'number', 'boolean', 'json'];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid setting type: ${type}. Must be one of: ${validTypes.join(', ')}`);
  }

  sqlite
    .prepare(
      'INSERT INTO system_settings (key, value, type, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, type = ?, description = ?, updated_at = ?'
    )
    .run(key, value, type, description ?? null, now, now, value, type, description ?? null, now);
}

export async function getAllSettings(): Promise<SystemSetting[]> {
  const sqlite = await getDatabase();
  const rows = sqlite
    .prepare(
      'SELECT key, value, type, description, created_at, updated_at FROM system_settings ORDER BY key'
    )
    .all() as Array<{
    key: string;
    value: string;
    type: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    key: row.key,
    value: row.value,
    type: row.type as SystemSetting['type'],
    description: row.description ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

export async function getNotificationChannels(): Promise<NotificationChannel[]> {
  const sqlite = await getDatabase();
  const rows = sqlite
    .prepare(
      'SELECT id, provider, name, enabled, config, from_name, from_address, created_at, updated_at FROM notification_channels ORDER BY name'
    )
    .all() as Array<{
    id: string;
    provider: string;
    name: string;
    enabled: number;
    config: string;
    from_name: string | null;
    from_address: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider as NotificationProvider,
    name: row.name,
    enabled: Boolean(row.enabled),
    config: row.config,
    fromName: row.from_name ?? undefined,
    fromAddress: row.from_address ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

export async function getNotificationChannel(
  provider: NotificationProvider
): Promise<NotificationChannel | null> {
  const sqlite = await getDatabase();
  const row = sqlite
    .prepare(
      'SELECT id, provider, name, enabled, config, from_name, from_address, created_at, updated_at FROM notification_channels WHERE provider = ?'
    )
    .get(provider) as
    | {
        id: string;
        provider: string;
        name: string;
        enabled: number;
        config: string;
        from_name: string | null;
        from_address: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    provider: row.provider as NotificationProvider,
    name: row.name,
    enabled: Boolean(row.enabled),
    config: row.config,
    fromName: row.from_name ?? undefined,
    fromAddress: row.from_address ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function saveNotificationChannel(
  channel: Omit<NotificationChannel, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<NotificationChannel> {
  const sqlite = await getDatabase();
  const now = new Date().toISOString();

  const validProviders: NotificationProvider[] = ['smtp', 'resend', 'slack', 'telegram', 'discord'];
  if (!validProviders.includes(channel.provider)) {
    throw new Error(
      `Invalid provider: ${channel.provider}. Must be one of: ${validProviders.join(', ')}`
    );
  }

  const id = channel.id ?? crypto.randomUUID();
  const exists =
    sqlite.prepare('SELECT 1 FROM notification_channels WHERE id = ?').get(id) !== undefined;

  if (exists) {
    sqlite
      .prepare(
        'UPDATE notification_channels SET provider = ?, name = ?, enabled = ?, config = ?, from_name = ?, from_address = ?, updated_at = ? WHERE id = ?'
      )
      .run(
        channel.provider,
        channel.name,
        channel.enabled ? 1 : 0,
        channel.config,
        channel.fromName ?? null,
        channel.fromAddress ?? null,
        now,
        id
      );
  } else {
    sqlite
      .prepare(
        'INSERT INTO notification_channels (id, provider, name, enabled, config, from_name, from_address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        channel.provider,
        channel.name,
        channel.enabled ? 1 : 0,
        channel.config,
        channel.fromName ?? null,
        channel.fromAddress ?? null,
        now,
        now
      );
  }

  const result = await getNotificationChannel(channel.provider);
  if (!result) {
    throw new Error('Failed to save notification channel');
  }
  return result;
}

export async function deleteNotificationChannel(id: string): Promise<boolean> {
  const sqlite = await getDatabase();
  const result = sqlite.prepare('DELETE FROM notification_channels WHERE id = ?').run(id);
  return result.changes > 0;
}

export async function findUserByUsername(username: string): Promise<StoredUser | null> {
  const sqlite = await getDatabase();
  const row = sqlite
    .prepare(
      'SELECT id, username, password_hash, role, refresh_token, created_at, updated_at FROM users WHERE username = ?'
    )
    .get(username) as
    | {
        id: string;
        username: string;
        password_hash: string;
        role: string;
        refresh_token: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role as UserRole,
    refreshToken: row.refresh_token ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function findUserById(id: string): Promise<StoredUser | null> {
  const sqlite = await getDatabase();
  const row = sqlite
    .prepare(
      'SELECT id, username, password_hash, role, refresh_token, created_at, updated_at FROM users WHERE id = ?'
    )
    .get(id) as
    | {
        id: string;
        username: string;
        password_hash: string;
        role: string;
        refresh_token: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role as UserRole,
    refreshToken: row.refresh_token ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function createUser(
  user: Omit<StoredUser, 'id' | 'createdAt' | 'updatedAt'>
): Promise<StoredUser> {
  const sqlite = await getDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  sqlite
    .prepare(
      `
    INSERT INTO users (id, username, password_hash, role, refresh_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(id, user.username, user.passwordHash, user.role, user.refreshToken ?? null, now, now);

  return {
    ...user,
    id,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

export async function updateUser(
  id: string,
  updates: Partial<Omit<StoredUser, 'id' | 'createdAt'>>
): Promise<StoredUser | null> {
  const existing = await findUserById(id);
  if (!existing) return null;

  const sqlite = await getDatabase();
  const passwordHash = updates.passwordHash ?? existing.passwordHash;
  const role = updates.role ?? existing.role;
  const refreshToken =
    updates.refreshToken !== undefined ? updates.refreshToken : existing.refreshToken;
  const username = updates.username ?? existing.username;
  const updatedAt = new Date().toISOString();

  sqlite
    .prepare(
      `
    UPDATE users SET username = ?, password_hash = ?, role = ?, refresh_token = ?, updated_at = ?
    WHERE id = ?
  `
    )
    .run(username, passwordHash, role, refreshToken ?? null, updatedAt, id);

  return findUserById(id);
}

export async function deleteUser(id: string): Promise<boolean> {
  const sqlite = await getDatabase();
  const result = sqlite.prepare('DELETE FROM users WHERE id = ?').run(id);
  return result.changes > 0;
}

export async function listUsers(): Promise<User[]> {
  const sqlite = await getDatabase();
  const rows = sqlite
    .prepare('SELECT id, username, role, created_at, updated_at FROM users')
    .all() as Array<{
    id: string;
    username: string;
    role: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    role: r.role as UserRole,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  }));
}

export async function addAuditLog(log: {
  userId: string;
  username: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip: string;
  userAgent: string;
}): Promise<void> {
  const sqlite = await getDatabase();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  sqlite
    .prepare(
      `
    INSERT INTO audit_logs (id, timestamp, user_id, username, action, resource, resource_id, details, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      id,
      timestamp,
      log.userId,
      log.username,
      log.action,
      log.resource,
      log.resourceId ?? null,
      log.details ? JSON.stringify(log.details) : null,
      log.ip,
      log.userAgent
    );

  const count = (sqlite.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as { c: number }).c;
  if (count > 10000) {
    const toDelete = sqlite
      .prepare('SELECT id FROM audit_logs ORDER BY timestamp ASC LIMIT ?')
      .all(count - 10000) as Array<{ id: string }>;
    const del = sqlite.prepare('DELETE FROM audit_logs WHERE id = ?');
    for (const r of toDelete) del.run(r.id);
  }
}

export async function getAuditLogs(limit = 100): Promise<AuditLog[]> {
  const sqlite = await getDatabase();
  const rows = sqlite
    .prepare(
      `
    SELECT id, timestamp, user_id, username, action, resource, resource_id, details, ip, user_agent
    FROM audit_logs ORDER BY timestamp DESC LIMIT ?
  `
    )
    .all(limit) as Array<{
    id: string;
    timestamp: string;
    user_id: string;
    username: string;
    action: string;
    resource: string;
    resource_id: string | null;
    details: string | null;
    ip: string;
    user_agent: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    userId: r.user_id,
    username: r.username,
    action: r.action,
    resource: r.resource,
    resourceId: r.resource_id ?? undefined,
    details: r.details ? (JSON.parse(r.details) as Record<string, unknown>) : undefined,
    ip: r.ip,
    userAgent: r.user_agent,
  }));
}

// ============================================================================
// NOTIFICATION RULES FUNCTIONS (DP-202/DP-203)
// ============================================================================

export function getNotificationRules(): NotificationRule[] {
  if (!db) return [];

  const rows = db
    .prepare(
      `
    SELECT id, event_type as eventType, channel_id as channelId, enabled, min_severity as minSeverity, cooldown_minutes as cooldownMinutes, created_at, updated_at
    FROM notification_rules ORDER BY created_at DESC
  `
    )
    .all() as Array<{
    id: string;
    eventType: string;
    channelId: string;
    enabled: number;
    minSeverity: string;
    cooldownMinutes: number;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    channelId: r.channelId,
    enabled: Boolean(r.enabled),
    minSeverity: r.minSeverity as 'info' | 'warning' | 'critical',
    cooldownMinutes: r.cooldownMinutes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getNotificationRulesByEvent(eventType: string): NotificationRule[] {
  if (!db) return [];

  const rows = db
    .prepare(
      `
    SELECT id, event_type as eventType, channel_id as channelId, enabled, min_severity as minSeverity, cooldown_minutes as cooldownMinutes, created_at, updated_at
    FROM notification_rules WHERE event_type = ? ORDER BY created_at DESC
  `
    )
    .all(eventType) as Array<{
    id: string;
    eventType: string;
    channelId: string;
    enabled: number;
    minSeverity: string;
    cooldownMinutes: number;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    channelId: r.channelId,
    enabled: Boolean(r.enabled),
    minSeverity: r.minSeverity as 'info' | 'warning' | 'critical',
    cooldownMinutes: r.cooldownMinutes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getNotificationRulesMatrix(): NotificationRulesMatrix {
  const rules = getNotificationRules();
  const matrix: NotificationRulesMatrix = {};

  for (const rule of rules) {
    if (!matrix[rule.eventType]) {
      matrix[rule.eventType] = [];
    }
    matrix[rule.eventType].push(rule);
  }

  return matrix;
}

export function saveNotificationRule(
  rule: Omit<NotificationRule, 'id' | 'createdAt' | 'updatedAt'>
): NotificationRule {
  if (!db) throw new Error('Database not initialized');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO notification_rules (id, event_type, channel_id, enabled, min_severity, cooldown_minutes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    rule.eventType,
    rule.channelId,
    rule.enabled ? 1 : 0,
    rule.minSeverity,
    rule.cooldownMinutes,
    now,
    now
  );

  return {
    id,
    eventType: rule.eventType,
    channelId: rule.channelId,
    enabled: rule.enabled,
    minSeverity: rule.minSeverity,
    cooldownMinutes: rule.cooldownMinutes,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateNotificationRule(
  id: string,
  updates: Partial<Omit<NotificationRule, 'id' | 'createdAt' | 'updatedAt'>>
): NotificationRule {
  if (!db) throw new Error('Database not initialized');

  const existing = db.prepare('SELECT 1 FROM notification_rules WHERE id = ?').get(id);
  if (!existing) {
    throw new Error('Notification rule not found');
  }

  const now = new Date().toISOString();
  const sets: string[] = [];
  const values: (string | number)[] = [];

  if (updates.eventType !== undefined) {
    sets.push('event_type = ?');
    values.push(updates.eventType);
  }
  if (updates.channelId !== undefined) {
    sets.push('channel_id = ?');
    values.push(updates.channelId);
  }
  if (updates.enabled !== undefined) {
    sets.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }
  if (updates.minSeverity !== undefined) {
    sets.push('min_severity = ?');
    values.push(updates.minSeverity);
  }
  if (updates.cooldownMinutes !== undefined) {
    sets.push('cooldown_minutes = ?');
    values.push(updates.cooldownMinutes);
  }

  sets.push('updated_at = ?');
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE notification_rules SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  const row = db
    .prepare(
      `
    SELECT id, event_type, channel_id, enabled, min_severity, cooldown_minutes, created_at, updated_at
    FROM notification_rules WHERE id = ?
  `
    )
    .get(id) as NotificationRuleRecord | undefined;

  if (!row) {
    throw new Error('Failed to retrieve updated rule');
  }

  return {
    id: row.id,
    eventType: row.event_type,
    channelId: row.channel_id,
    enabled: Boolean(row.enabled),
    minSeverity: row.min_severity as 'info' | 'warning' | 'critical',
    cooldownMinutes: row.cooldown_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function deleteNotificationRule(id: string): void {
  if (!db) throw new Error('Database not initialized');

  const result = db.prepare('DELETE FROM notification_rules WHERE id = ?').run(id);
  if (result.changes === 0) {
    throw new Error('Notification rule not found');
  }
}

// ============================================================================
// NOTIFICATION HISTORY FUNCTIONS (DP-202/DP-203)
// ============================================================================

export function getRecentNotificationHistory(limit = 50): NotificationHistory[] {
  if (!db) return [];

  const rows = db
    .prepare(
      `
    SELECT id, event_type as eventType, channel_id as channelId, severity, message, recipients, status, error, retry_count as retryCount, sent_at as sentAt, created_at
    FROM notification_history ORDER BY created_at DESC LIMIT ?
  `
    )
    .all(limit) as Array<{
    id: string;
    eventType: string;
    channelId: string;
    severity: string;
    message: string;
    recipients: string | null;
    status: 'pending' | 'sent' | 'failed' | 'retrying';
    error: string | null;
    retryCount: number;
    sentAt: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    channelId: r.channelId,
    severity: r.severity,
    message: r.message,
    recipients: r.recipients ?? undefined,
    status: r.status,
    error: r.error ?? undefined,
    retryCount: r.retryCount,
    sentAt: r.sentAt ?? undefined,
    createdAt: r.created_at,
  }));
}

export function addNotificationHistory(
  entry: Omit<NotificationHistory, 'id' | 'createdAt'>
): NotificationHistory {
  if (!db) throw new Error('Database not initialized');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO notification_history (id, event_type, channel_id, severity, message, recipients, status, error, retry_count, sent_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    entry.eventType,
    entry.channelId,
    entry.severity,
    entry.message,
    entry.recipients ?? null,
    entry.status,
    entry.error ?? null,
    entry.retryCount ?? 0,
    entry.sentAt ?? null,
    now
  );

  return {
    id,
    eventType: entry.eventType,
    channelId: entry.channelId,
    severity: entry.severity,
    message: entry.message,
    recipients: entry.recipients,
    status: entry.status,
    error: entry.error,
    retryCount: entry.retryCount ?? 0,
    sentAt: entry.sentAt,
    createdAt: now,
  };
}

export function updateNotificationHistory(
  id: string,
  updates: Partial<Pick<NotificationHistory, 'status' | 'retryCount' | 'error' | 'sentAt'>>
): void {
  if (!db) throw new Error('Database not initialized');

  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
  }
  if (updates.retryCount !== undefined) {
    sets.push('retry_count = ?');
    values.push(updates.retryCount);
  }
  if (updates.error !== undefined) {
    sets.push('error = ?');
    values.push(updates.error ?? null);
  }
  if (updates.sentAt !== undefined) {
    sets.push('sent_at = ?');
    values.push(updates.sentAt ?? null);
  }

  values.push(id);
  db.prepare(`UPDATE notification_history SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function getNotificationHistoryByEvent(
  eventType: string,
  limit = 50
): NotificationHistory[] {
  if (!db) return [];

  const rows = db
    .prepare(
      `
    SELECT id, event_type as eventType, channel_id as channelId, severity, message, recipients, status, error, retry_count as retryCount, sent_at as sentAt, created_at
    FROM notification_history WHERE event_type = ? ORDER BY created_at DESC LIMIT ?
  `
    )
    .all(eventType, limit) as Array<{
    id: string;
    eventType: string;
    channelId: string;
    severity: string;
    message: string;
    recipients: string | null;
    status: 'pending' | 'sent' | 'failed' | 'retrying';
    error: string | null;
    retryCount: number;
    sentAt: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    channelId: r.channelId,
    severity: r.severity,
    message: r.message,
    recipients: r.recipients ?? undefined,
    status: r.status,
    error: r.error ?? undefined,
    retryCount: r.retryCount,
    sentAt: r.sentAt ?? undefined,
    createdAt: r.created_at,
  }));
}

export function wasRecentlyNotified(
  eventType: string,
  channelId: string,
  cooldownMinutes: number
): boolean {
  if (!db || cooldownMinutes === 0) return false;

  const cutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();

  const row = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM notification_history
    WHERE event_type = ? AND channel_id = ? AND status IN ('sent', 'pending', 'retrying') AND (sent_at > ? OR (sent_at IS NULL AND created_at > ?))
  `
    )
    .get(eventType, channelId, cutoff, cutoff) as { count: number } | undefined;

  return (row?.count ?? 0) > 0;
}
