const BACKUPS_DIR = 'backups';
const MAX_BACKUPS = 5;
const LAST_BACKUP_KEY = 'sn_last_auto_backup';
const BACKUP_REMINDER_DAYS = 3;

export interface BackupEntry {
  name: string;
  date: Date;
  size: number;
}

async function getBackupsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(BACKUPS_DIR, { create: true });
}

export async function saveBackup(payload: object): Promise<string> {
  const dir = await getBackupsDir();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const name = `backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
  const json = JSON.stringify(payload);
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await (handle as any).createWritable();
  await writable.write(json);
  await writable.close();

  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));

  await pruneOldBackups(dir);
  return name;
}

async function pruneOldBackups(dir: FileSystemDirectoryHandle): Promise<void> {
  const entries: string[] = [];
  for await (const [name] of (dir as any).entries()) {
    if (name.startsWith('backup-') && name.endsWith('.json')) entries.push(name);
  }
  entries.sort();
  while (entries.length > MAX_BACKUPS) {
    const oldest = entries.shift()!;
    try { await (dir as any).removeEntry(oldest); } catch {}
  }
}

export async function listBackups(): Promise<BackupEntry[]> {
  try {
    const dir = await getBackupsDir();
    const entries: BackupEntry[] = [];
    for await (const [name, handle] of (dir as any).entries()) {
      if (!name.startsWith('backup-') || !name.endsWith('.json')) continue;
      try {
        const file = await (handle as any).getFile();
        // Parse date from filename: backup-YYYY-MM-DD-HHmm.json
        const m = name.match(/backup-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.json/);
        const date = m
          ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
          : new Date(file.lastModified);
        entries.push({ name, date, size: file.size });
      } catch {}
    }
    entries.sort((a, b) => b.date.getTime() - a.date.getTime());
    return entries;
  } catch {
    return [];
  }
}

export async function loadBackup(name: string): Promise<object> {
  const dir = await getBackupsDir();
  const handle = await dir.getFileHandle(name);
  const file = await (handle as any).getFile();
  const text = await file.text();
  return JSON.parse(text);
}

export async function deleteBackup(name: string): Promise<void> {
  const dir = await getBackupsDir();
  await (dir as any).removeEntry(name);
}

export function shouldShowBackupReminder(): boolean {
  const last = localStorage.getItem(LAST_BACKUP_KEY);
  if (!last) return true;
  const elapsed = Date.now() - Number(last);
  return elapsed > BACKUP_REMINDER_DAYS * 24 * 60 * 60 * 1000;
}

export function markBackupDone(): void {
  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
}
