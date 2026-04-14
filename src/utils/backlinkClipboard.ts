const KEY = 'sheafy_pending_backlink';
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface PendingBacklink {
  id: string;
  title: string;
  storedAt: number;
}

export function storePendingBacklink(id: string, title: string): void {
  const data: PendingBacklink = { id, title, storedAt: Date.now() };
  sessionStorage.setItem(KEY, JSON.stringify(data));
  navigator.clipboard.writeText(title).catch(() => {});
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Returns and clears the pending backlink if clipboard text matches and TTL is valid. */
export function consumePendingBacklink(clipboardText: string): PendingBacklink | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const data: PendingBacklink = JSON.parse(raw);
    if (Date.now() - data.storedAt > TTL_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    if (norm(clipboardText) !== norm(data.title)) return null;
    sessionStorage.removeItem(KEY);
    return data;
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
}
