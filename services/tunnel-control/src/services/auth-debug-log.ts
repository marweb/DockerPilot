export interface AuthDebugEntry {
  timestamp: string;
  action: string;
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

const MAX_ENTRIES = 200;
const entries: AuthDebugEntry[] = [];

export function addAuthDebugEntry(entry: AuthDebugEntry): void {
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }
}

export function listAuthDebugEntries(limit = 50): AuthDebugEntry[] {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_ENTRIES) : 50;
  return entries.slice(0, safeLimit);
}
