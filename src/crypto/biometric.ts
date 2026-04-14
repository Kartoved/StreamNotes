// WebAuthn-based biometric unlock for Sheafy
// Security model: WebAuthn assertion gates access to a random wrap key stored
// in IndexedDB. The wrap key encrypts the mnemonic via XChaCha20-Poly1305.
// An attacker with full filesystem access could extract both, but this is
// equivalent to the existing sn_seed_plain flow — biometric protects against
// casual/remote unauthorized access, not physical device forensics.

import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';

const CRED_ID_KEY  = 'sn_bio_cred_id';   // base64url credential ID
const SEED_ENC_KEY = 'sn_bio_seed_enc';  // base64 encrypted mnemonic
const DB_NAME = 'sheafy_bio';
const STORE   = 'wrapkey';
const KEY_ID  = 'k1';

// ── Platform authenticator availability ────────────────────────────────

/** Returns a human-readable reason if biometric cannot be used, or null if supported. */
export async function biometricUnsupportedReason(): Promise<string | null> {
  if (!window.PublicKeyCredential || !navigator.credentials?.create) {
    return 'Браузер не поддерживает WebAuthn';
  }
  // Firefox for Android claims UVPA support but credentials.create fails in practice.
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua) && /Android/.test(ua)) {
    return 'Firefox для Android не поддерживает биометрическую аутентификацию. Используйте Chrome или Samsung Internet.';
  }
  try {
    const ok = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!ok) return 'Устройство не поддерживает биометрическую аутентификацию';
    return null; // supported
  } catch {
    return 'Биометрия недоступна на этом устройстве';
  }
}

export async function isBiometricSupported(): Promise<boolean> {
  return (await biometricUnsupportedReason()) === null;
}

export function isBiometricEnrolled(): boolean {
  return (
    !!localStorage.getItem(CRED_ID_KEY) &&
    !!localStorage.getItem(SEED_ENC_KEY)
  );
}

// ── IndexedDB wrap-key storage ─────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function saveWrapKey(key: Uint8Array): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(key, KEY_ID);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

async function readWrapKey(): Promise<Uint8Array | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY_ID);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror   = () => { db.close(); reject(req.error); };
  });
}

async function deleteWrapKey(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY_ID);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

// ── Crypto helpers ──────────────────────────────────────────────────────

function wrapSeed(mnemonic: string, key: Uint8Array): string {
  const nonce = randomBytes(24);
  const ct    = xchacha20poly1305(key, nonce).encrypt(new TextEncoder().encode(mnemonic));
  const out   = new Uint8Array(24 + ct.length);
  out.set(nonce, 0);
  out.set(ct, 24);
  let s = '';
  for (let i = 0; i < out.length; i++) s += String.fromCharCode(out[i]);
  return btoa(s);
}

function unwrapSeed(encoded: string, key: Uint8Array): string | null {
  try {
    const s   = atob(encoded);
    const raw = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) raw[i] = s.charCodeAt(i);
    const plain = xchacha20poly1305(key, raw.slice(0, 24)).decrypt(raw.slice(24));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

function toB64url(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── Public API ──────────────────────────────────────────────────────────

/** Register a platform authenticator and persist the encrypted mnemonic. */
export async function registerBiometric(mnemonic: string): Promise<void> {
  const rpId      = window.location.hostname;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId    = crypto.getRandomValues(new Uint8Array(16));

  let credential: PublicKeyCredential | null = null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        rp: { id: rpId, name: 'Sheafy' },
        user: { id: userId, name: 'user', displayName: 'Sheafy User' },
        challenge,
        pubKeyCredParams: [
          { type: 'public-key', alg: -7   },  // ES256
          { type: 'public-key', alg: -257 },  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
  } catch (err: any) {
    // NotAllowedError = user cancelled or denied
    if (err?.name === 'NotAllowedError') throw new Error('Отменено пользователем');
    // Anything else (browser incompatibility, extension interference, etc.)
    throw new Error('Биометрия не поддерживается в этом браузере');
  }

  if (!credential) throw new Error('Отменено пользователем');

  const wrapKey = randomBytes(32);
  await saveWrapKey(wrapKey);
  localStorage.setItem(CRED_ID_KEY,  toB64url(credential.rawId));
  localStorage.setItem(SEED_ENC_KEY, wrapSeed(mnemonic, wrapKey));
}

/**
 * Trigger biometric authentication and return the decrypted mnemonic.
 * Returns null if the user cancels, the credential is gone, or the wrap key
 * has been cleared (stale enrollment — caller should call clearBiometric).
 */
export async function unlockWithBiometric(): Promise<string | null> {
  const credIdStr = localStorage.getItem(CRED_ID_KEY);
  if (!credIdStr) return null;

  const rpId      = window.location.hostname;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const credIdBytes = fromB64url(credIdStr);
  const credId = new Uint8Array(credIdBytes).buffer;

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        rpId,
        challenge,
        allowCredentials: [{ type: 'public-key', id: credId }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) return null;

    const wrapKey = await readWrapKey();
    if (!wrapKey) {
      // Wrap key lost (e.g. storage cleared) — clean up stale enrollment
      await clearBiometric();
      return null;
    }

    const encoded = localStorage.getItem(SEED_ENC_KEY);
    if (!encoded) return null;

    return unwrapSeed(encoded, wrapKey);
  } catch {
    // User cancelled or authenticator error — don't clear, let them retry
    return null;
  }
}

/** Remove all biometric data from this device. */
export async function clearBiometric(): Promise<void> {
  localStorage.removeItem(CRED_ID_KEY);
  localStorage.removeItem(SEED_ENC_KEY);
  await deleteWrapKey().catch(() => {});
}
