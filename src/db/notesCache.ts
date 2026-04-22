// Module-level caches for decrypted + parsed note data.
//
// Both caches are keyed by note id and validated against `updated_at`.
// On a refetch, only rows whose `updated_at` changed pay the AES-GCM /
// JSON parse / TipTap traversal cost. Switching feeds or views reuses
// everything from previous loads.
//
// Caches are cleared on key rotation / logout via `clearNotesCache()`.

interface DecryptedEntry {
  updated_at: number;
  content: string;
  properties: string;
}

interface ParsedEntry {
  updated_at: number;
  parsed: { props: any; text: string };
}

const decryptCache = new Map<string, DecryptedEntry>();
const parseCache = new Map<string, ParsedEntry>();

export function getOrDecrypt(
  id: string,
  updated_at: number,
  encContent: string,
  encProperties: string,
  dec: (s: string) => string,
): { content: string; properties: string } {
  const hit = decryptCache.get(id);
  if (hit && hit.updated_at === updated_at) {
    return { content: hit.content, properties: hit.properties };
  }

  let content = '[Ошибка расшифровки]';
  let properties = '{}';
  let contentOk = false;
  let propsOk = false;
  try { content = dec(encContent); contentOk = true; } catch { /* keep fallback */ }
  try { properties = dec(encProperties); propsOk = true; } catch { /* keep fallback */ }

  // Don't cache failures — a missing FEK may arrive later (e.g. via invite import),
  // and we'd otherwise serve the stale error string until updated_at changes.
  if (contentOk && propsOk) {
    decryptCache.set(id, { updated_at, content, properties });
  }
  return { content, properties };
}

/** Sync cache lookup without invoking the fallback decrypt. Used by the
 *  worker path to separate hits from misses before posting a batch. */
export function peekDecryptCache(id: string, updated_at: number): { content: string; properties: string } | null {
  const hit = decryptCache.get(id);
  if (hit && hit.updated_at === updated_at) {
    return { content: hit.content, properties: hit.properties };
  }
  return null;
}

/** Populate the cache from a worker-returned decrypt result. */
export function putDecryptCache(id: string, updated_at: number, content: string, properties: string): void {
  decryptCache.set(id, { updated_at, content, properties });
}

export function getOrParse(
  id: string,
  updated_at: number,
  content: string,
  properties: string,
): { props: any; text: string } {
  const hit = parseCache.get(id);
  if (hit && hit.updated_at === updated_at) return hit.parsed;

  let props: any = {};
  try { props = JSON.parse(properties || '{}'); } catch { /* keep empty */ }
  const parsed = { props, text: extractPlainText(content).toLocaleLowerCase() };
  parseCache.set(id, { updated_at, parsed });
  return parsed;
}

export function clearNotesCache(): void {
  decryptCache.clear();
  parseCache.clear();
}

export function dropFromNotesCache(id: string): void {
  decryptCache.delete(id);
  parseCache.delete(id);
}

// ── Plain-text + tag extraction (lives here to avoid Feed↔hooks circular import) ──

export function extractPlainText(content: string, skipCode = false): string {
  try {
    const doc = JSON.parse(content);
    const getText = (node: any): string => {
      if (skipCode) {
        if (node.type === 'codeBlock') return '';
        if (node.marks?.some((m: any) => m.type === 'code')) return '';
      }
      if (node.type === 'text') return node.text || '';
      return (node.content || []).map(getText).join(' ');
    };
    return getText(doc);
  } catch {
    return content;
  }
}

export function extractTags(content: string): string[] {
  const text = extractPlainText(content, true);
  const matches = text.match(/#[\w\u0400-\u04FF][\w\u0400-\u04FF0-9_]*/gi) || [];
  return [...new Set(matches.map((t: string) => t.toLocaleLowerCase()))];
}
