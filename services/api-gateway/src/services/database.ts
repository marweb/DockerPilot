import Database from 'better-sqlite3';
import { readFile } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import type { User, UserRole } from '@dockpilot/types';

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

  const insertMeta = sqlite.prepare(
    'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)'
  );
  insertMeta.run('setup_complete', jsonDb.setupComplete ? '1' : '0');
  insertMeta.run('migrated_from_json', '1');

  if (jsonDb.users?.length) {
    const insertUser = sqlite.prepare(`
      INSERT INTO users (id, username, password_hash, role, refresh_token, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const u of jsonDb.users) {
      const createdAt = typeof u.createdAt === 'string' ? u.createdAt : (u.createdAt as Date).toISOString();
      const updatedAt = typeof u.updatedAt === 'string' ? u.updatedAt : (u.updatedAt as Date).toISOString();
      insertUser.run(u.id, u.username, u.passwordHash, u.role, u.refreshToken ?? null, createdAt, updatedAt);
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

async function initSqlite(): Promise<void> {
  ensureDataDir();
  const dbPath = getDbPath();
  const sqlite = new Database(dbPath);

  sqlite.pragma('journal_mode = WAL');
  createSchema(sqlite);

  const meta = sqlite.prepare('SELECT value FROM meta WHERE key = ?').get('setup_complete') as { value: string } | undefined;
  const hasMeta = meta !== undefined;
  const jsonPath = getDbJsonPath();
  const jsonExists = existsSync(jsonPath);

  if (jsonExists && !hasMeta) {
    await migrateFromJson(sqlite);
  } else if (!hasMeta) {
    sqlite.prepare("INSERT INTO meta (key, value) VALUES ('setup_complete', '0')").run();
  }

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
  const row = sqlite.prepare('SELECT value FROM meta WHERE key = ?').get('setup_complete') as { value: string } | undefined;
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
  const row = sqlite.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export async function setSystemSetting(key: string, value: string): Promise<void> {
  const sqlite = await getDatabase();
  sqlite.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
}

export async function getSystemSettings(): Promise<Record<string, string>> {
  const sqlite = await getDatabase();
  const rows = sqlite.prepare("SELECT key, value FROM meta WHERE key LIKE 'setting_%'").all() as Array<{ key: string; value: string }>;
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key.replace('setting_', '')] = row.value;
  }
  return settings;
}

export async function findUserByUsername(username: string): Promise<StoredUser | null> {
  const sqlite = await getDatabase();
  const row = sqlite.prepare(
    'SELECT id, username, password_hash, role, refresh_token, created_at, updated_at FROM users WHERE username = ?'
  ).get(username) as {
    id: string;
    username: string;
    password_hash: string;
    role: string;
    refresh_token: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

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
  const row = sqlite.prepare(
    'SELECT id, username, password_hash, role, refresh_token, created_at, updated_at FROM users WHERE id = ?'
  ).get(id) as {
    id: string;
    username: string;
    password_hash: string;
    role: string;
    refresh_token: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

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

  sqlite.prepare(`
    INSERT INTO users (id, username, password_hash, role, refresh_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, user.username, user.passwordHash, user.role, user.refreshToken ?? null, now, now);

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
  const refreshToken = updates.refreshToken !== undefined ? updates.refreshToken : existing.refreshToken;
  const username = updates.username ?? existing.username;
  const updatedAt = new Date().toISOString();

  sqlite.prepare(`
    UPDATE users SET username = ?, password_hash = ?, role = ?, refresh_token = ?, updated_at = ?
    WHERE id = ?
  `).run(username, passwordHash, role, refreshToken ?? null, updatedAt, id);

  return findUserById(id);
}

export async function deleteUser(id: string): Promise<boolean> {
  const sqlite = await getDatabase();
  const result = sqlite.prepare('DELETE FROM users WHERE id = ?').run(id);
  return result.changes > 0;
}

export async function listUsers(): Promise<User[]> {
  const sqlite = await getDatabase();
  const rows = sqlite.prepare(
    'SELECT id, username, role, created_at, updated_at FROM users'
  ).all() as Array<{
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

  sqlite.prepare(`
    INSERT INTO audit_logs (id, timestamp, user_id, username, action, resource, resource_id, details, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
    const toDelete = sqlite.prepare(
      'SELECT id FROM audit_logs ORDER BY timestamp ASC LIMIT ?'
    ).all(count - 10000) as Array<{ id: string }>;
    const del = sqlite.prepare('DELETE FROM audit_logs WHERE id = ?');
    for (const r of toDelete) del.run(r.id);
  }
}

export async function getAuditLogs(limit = 100): Promise<AuditLog[]> {
  const sqlite = await getDatabase();
  const rows = sqlite.prepare(`
    SELECT id, timestamp, user_id, username, action, resource, resource_id, details, ip, user_agent
    FROM audit_logs ORDER BY timestamp DESC LIMIT ?
  `).all(limit) as Array<{
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
