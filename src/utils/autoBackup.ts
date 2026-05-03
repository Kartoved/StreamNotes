// Backup storage uses IndexedDB — works on all browsers including iOS Safari,
// which does not support FileSystemFileHandle.createWritable() before v17.4.
// Previous versions used OPFS createWritable(); that caused "invalid error"
// on mobile. Migration: listBackups() also reads old OPFS entries so existing
// desktop backups remain visible until the user deletes them.

const IDB_NAME = 'sheafy_backups';
const IDB_STORE = 'backups';
const IDB_VERSION = 1;
const MAX_BACKUPS = 5;
const LAST_BACKUP_KEY = 'sn_last_auto_backup';
const BACKUP_REMINDER_DAYS = 3;

export interface BackupEntry {
  name: string;
  date: Date;
  size: number;
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      (e.target as IDBOpenDBRequest).result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbKeys(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

function parseNameToDate(name: string): Date | null {
  const m = name.match(/backup-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.json/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}

export async function saveBackup(payload: object): Promise<string> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const name = `backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
  const json = JSON.stringify(payload);

  const db = await openIDB();
  await idbPut(db, name, json);
  db.close();

  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  await pruneOldBackups();
  return name;
}

async function pruneOldBackups(): Promise<void> {
  const db = await openIDB();
  const keys = (await idbKeys(db)).filter(k => k.startsWith('backup-') && k.endsWith('.json'));
  keys.sort();
  while (keys.length > MAX_BACKUPS) {
    const oldest = keys.shift()!;
    await idbDelete(db, oldest);
  }
  db.close();
}

export async function listBackups(): Promise<BackupEntry[]> {
  const entries: BackupEntry[] = [];

  // IDB backups (primary store)
  try {
    const db = await openIDB();
    const keys = (await idbKeys(db)).filter(k => k.startsWith('backup-') && k.endsWith('.json'));
    for (const name of keys) {
      const json = await idbGet(db, name);
      const date = parseNameToDate(name) ?? new Date();
      entries.push({ name, date, size: json?.length ?? 0 });
    }
    db.close();
  } catch { /* IDB unavailable */ }

  // Legacy OPFS backups (read-only — keeps old desktop backups visible)
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('backups', { create: false });
    for await (const [name, handle] of (dir as any).entries()) {
      if (!name.startsWith('backup-') || !name.endsWith('.json')) continue;
      if (entries.some(e => e.name === name)) continue; // already in IDB
      try {
        const file = await (handle as any).getFile();
        const date = parseNameToDate(name) ?? new Date(file.lastModified);
        entries.push({ name: `[OPFS] ${name}`, date, size: file.size });
      } catch { /* skip unreadable entries */ }
    }
  } catch { /* OPFS not available or backups dir missing */ }

  entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  return entries;
}

export async function loadBackup(name: string): Promise<object> {
  // Strip legacy prefix if present
  const realName = name.startsWith('[OPFS] ') ? name.slice(7) : name;

  if (!name.startsWith('[OPFS] ')) {
    const db = await openIDB();
    const json = await idbGet(db, realName);
    db.close();
    if (json) return JSON.parse(json);
  }

  // Fallback: read from OPFS (legacy)
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('backups', { create: false });
  const handle = await dir.getFileHandle(realName);
  const file = await (handle as any).getFile();
  return JSON.parse(await file.text());
}

export async function deleteBackup(name: string): Promise<void> {
  const realName = name.startsWith('[OPFS] ') ? name.slice(7) : name;

  if (!name.startsWith('[OPFS] ')) {
    const db = await openIDB();
    await idbDelete(db, realName);
    db.close();
    return;
  }

  // Legacy OPFS deletion
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('backups', { create: false });
  await (dir as any).removeEntry(realName);
}

export function shouldShowBackupReminder(): boolean {
  const last = localStorage.getItem(LAST_BACKUP_KEY);
  if (!last) return true;
  return Date.now() - Number(last) > BACKUP_REMINDER_DAYS * 24 * 60 * 60 * 1000;
}

export function markBackupDone(): void {
  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
}
