// Encode/decode invite payloads as URLs for QR codes and share links.
//
// The invite JSON is compacted (no whitespace), base64url-encoded, and placed
// in the URL fragment (#) so it never hits any server's access logs.
// `/invite#i=<base64url>` is the canonical form.
//
// Snapshots (notes + links) are INTENTIONALLY STRIPPED before encoding:
//   - QR capacity is ~2–3 KB at most; a feed with 50+ notes exceeds it.
//   - Nostr relay sync delivers the full history after import anyway.
// If the caller wants to share a snapshot, they use the textarea / pubkey-
// encrypted flow instead — link mode is for lean invites only.

export interface InvitePayload {
  flow_id: string;
  fek: string;
  name: string;
  author_npub?: string;
  role?: 'reader' | 'participant' | 'admin';
  // Snapshots are allowed on the wire but stripped for links.
  notes?: unknown[];
  links?: unknown[];
}

const INVITE_PATH = '/invite';
const FRAGMENT_KEY = 'i';

/** Build a shareable URL (origin + /invite#i=<base64url>) from a payload. */
export function encodeInviteLink(payload: InvitePayload, origin: string): string {
  const lean: InvitePayload = {
    flow_id: payload.flow_id,
    fek: payload.fek,
    name: payload.name,
  };
  if (payload.author_npub) lean.author_npub = payload.author_npub;
  if (payload.role) lean.role = payload.role;

  const json = JSON.stringify(lean);
  const b64 = base64UrlEncode(json);
  return `${origin.replace(/\/$/, '')}${INVITE_PATH}#${FRAGMENT_KEY}=${b64}`;
}

/**
 * Try to decode an invite from a URL (or raw `#i=...` fragment). Returns null
 * if the URL doesn't look like an invite or decoding fails.
 */
export function decodeInviteLink(urlOrFragment: string): InvitePayload | null {
  try {
    // Accept full URL, path+fragment, or bare fragment.
    let frag = urlOrFragment;
    const hashIdx = frag.indexOf('#');
    if (hashIdx >= 0) frag = frag.slice(hashIdx + 1);

    const params = new URLSearchParams(frag);
    const b64 = params.get(FRAGMENT_KEY);
    if (!b64) return null;

    const json = base64UrlDecode(b64);
    const parsed = JSON.parse(json);
    if (!isValidPayload(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** True if the current location.hash carries an invite. */
export function hashHasInvite(hash: string): boolean {
  const frag = hash.startsWith('#') ? hash.slice(1) : hash;
  return new URLSearchParams(frag).has(FRAGMENT_KEY);
}

function isValidPayload(x: unknown): x is InvitePayload {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.flow_id === 'string' && p.flow_id.length > 0 &&
    typeof p.fek === 'string' && /^[0-9a-f]{64}$/.test(p.fek) &&
    typeof p.name === 'string'
  );
}

// ─── base64url (no padding) ─────────────────────────────────────────────
function base64UrlEncode(s: string): string {
  // Handle UTF-8 safely (names/emojis)
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
