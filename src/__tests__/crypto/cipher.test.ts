import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, isEncrypted } from '../../crypto/cipher';

// A stable 32-byte test key (not derived from anything real)
const KEY_A = new Uint8Array(32).fill(0x01);
const KEY_B = new Uint8Array(32).fill(0x02);

describe('isEncrypted', () => {
  it('returns true for enc1: prefixed strings', () => {
    const ct = encrypt('hello', KEY_A);
    expect(isEncrypted(ct)).toBe(true);
  });

  it('returns false for plain strings', () => {
    expect(isEncrypted('hello world')).toBe(false);
    expect(isEncrypted('')).toBe(false);
    expect(isEncrypted('{"type":"doc"}')).toBe(false);
  });

  it('returns false for null-ish values', () => {
    expect(isEncrypted(undefined as any)).toBe(false);
    expect(isEncrypted(null as any)).toBe(false);
  });
});

describe('encrypt / decrypt roundtrip', () => {
  it('roundtrips a plain string', () => {
    const plain = 'Hello, Sheafy!';
    expect(decrypt(encrypt(plain, KEY_A), KEY_A)).toBe(plain);
  });

  it('roundtrips an empty string', () => {
    const plain = '';
    expect(decrypt(encrypt(plain, KEY_A), KEY_A)).toBe(plain);
  });

  it('roundtrips a TipTap JSON document', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test note' }] }],
    });
    expect(decrypt(encrypt(doc, KEY_A), KEY_A)).toBe(doc);
  });

  it('roundtrips unicode / emoji content', () => {
    const plain = 'Привет 🌍 こんにちは';
    expect(decrypt(encrypt(plain, KEY_A), KEY_A)).toBe(plain);
  });

  it('roundtrips large content (100 kB)', () => {
    const plain = 'x'.repeat(100_000);
    expect(decrypt(encrypt(plain, KEY_A), KEY_A)).toBe(plain);
  });

  it('produces different ciphertext each call (random nonce)', () => {
    const plain = 'same plaintext';
    const ct1 = encrypt(plain, KEY_A);
    const ct2 = encrypt(plain, KEY_A);
    expect(ct1).not.toBe(ct2);
  });
});

describe('key isolation', () => {
  it('decrypt with wrong key throws', () => {
    const ct = encrypt('secret', KEY_A);
    expect(() => decrypt(ct, KEY_B)).toThrow();
  });

  it('ciphertext from key A cannot be decrypted by key B', () => {
    const ct = encrypt('data', KEY_A);
    let threw = false;
    try { decrypt(ct, KEY_B); } catch { threw = true; }
    expect(threw).toBe(true);
  });
});

describe('decrypt passthrough', () => {
  it('returns plain strings unchanged (no enc1: prefix)', () => {
    // Legacy data that was never encrypted should pass through
    expect(decrypt('legacy plain text', KEY_A)).toBe('legacy plain text');
  });
});
