import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';

const ENC_PREFIX = 'enc1:';
const NONCE_LENGTH = 24;

export function encrypt(plaintext: string, key: Uint8Array): string {
  const data = new TextEncoder().encode(plaintext);
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = xchacha20poly1305(key, nonce);
  const ciphertext = cipher.encrypt(data);
  const combined = new Uint8Array(NONCE_LENGTH + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, NONCE_LENGTH);
  return ENC_PREFIX + uint8ToBase64(combined);
}

export function decrypt(encoded: string, key: Uint8Array): string {
  if (!isEncrypted(encoded)) return encoded;
  const raw = base64ToUint8(encoded.slice(ENC_PREFIX.length));
  const nonce = raw.slice(0, NONCE_LENGTH);
  const ciphertext = raw.slice(NONCE_LENGTH);
  const cipher = xchacha20poly1305(key, nonce);
  const plaintext = cipher.decrypt(ciphertext);
  return new TextDecoder().decode(plaintext);
}

export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/** Validates FEK format: 64 hex chars (32 bytes). Throws on invalid. */
export function assertValidFekHex(fekHex: string): void {
  if (typeof fekHex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(fekHex)) {
    throw new Error('Invalid FEK format: must be 64 hex characters');
  }
}

/** Attempts to decrypt with the given key. Returns true only if the input was
 *  actually encrypted with `ENC_PREFIX` AND the AEAD verification passed.
 *  Returns false for any failure (bad MAC, malformed, plaintext input, etc.). */
export function canDecryptWith(ciphertext: string, key: Uint8Array): boolean {
  if (!isEncrypted(ciphertext)) return false;
  try {
    decrypt(ciphertext, key);
    return true;
  } catch {
    return false;
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
