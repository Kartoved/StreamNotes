/**
 * Tests for per-feed encryption isolation.
 * Critical invariant: notes encrypted with Feed A's FEK must NOT be
 * decryptable with Feed B's FEK, nor with the master content key.
 */
import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../../crypto/cipher';
import { deriveKeys, deriveFeedKey } from '../../crypto/keys';
import { mnemonicToSeed } from '../../crypto/bip39';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function setupKeys() {
  const seed = mnemonicToSeed(MNEMONIC);
  const { contentKey, masterHD, nostrPubKey } = deriveKeys(seed);
  const fek0 = deriveFeedKey(masterHD, 0);
  const fek1 = deriveFeedKey(masterHD, 1);
  return { contentKey, fek0, fek1, nostrPubKey };
}

describe('per-feed encryption isolation', () => {
  it('note encrypted with FEK0 decrypts with FEK0', () => {
    const { fek0 } = setupKeys();
    const content = '{"type":"doc","content":[]}';
    expect(decrypt(encrypt(content, fek0), fek0)).toBe(content);
  });

  it('note encrypted with FEK0 cannot be decrypted with FEK1', () => {
    const { fek0, fek1 } = setupKeys();
    const ct = encrypt('private note', fek0);
    expect(() => decrypt(ct, fek1)).toThrow();
  });

  it('note encrypted with FEK0 cannot be decrypted with master key', () => {
    const { fek0, contentKey } = setupKeys();
    const ct = encrypt('private note', fek0);
    expect(() => decrypt(ct, contentKey)).toThrow();
  });

  it('note encrypted with master key cannot be decrypted with FEK', () => {
    const { fek0, contentKey } = setupKeys();
    const ct = encrypt('master-encrypted', contentKey);
    expect(() => decrypt(ct, fek0)).toThrow();
  });

  it('two feeds on same seed produce isolated keys', () => {
    const { fek0, fek1 } = setupKeys();
    const noteA = encrypt('feed A note', fek0);
    const noteB = encrypt('feed B note', fek1);
    // Cross-decryption must fail
    expect(() => decrypt(noteA, fek1)).toThrow();
    expect(() => decrypt(noteB, fek0)).toThrow();
    // Same-key decryption must succeed
    expect(decrypt(noteA, fek0)).toBe('feed A note');
    expect(decrypt(noteB, fek1)).toBe('feed B note');
  });
});

describe('FEK hex serialization roundtrip', () => {
  it('hex encodes and decodes a FEK without loss', () => {
    const seed = mnemonicToSeed(MNEMONIC);
    const { masterHD } = deriveKeys(seed);
    const fek = deriveFeedKey(masterHD, 0);
    const hex = bytesToHex(fek);
    const recovered = hexToBytes(hex);
    expect(bytesToHex(recovered)).toBe(hex);
    expect(recovered.length).toBe(32);
  });

  it('FEK stored as hex can be used to decrypt data', () => {
    const seed = mnemonicToSeed(MNEMONIC);
    const { masterHD } = deriveKeys(seed);
    const fek = deriveFeedKey(masterHD, 0);
    const fekHex = bytesToHex(fek);

    const ct = encrypt('shared note', fek);
    // Simulate what happens when FEK is loaded from DB as hex
    const recovered = hexToBytes(fekHex);
    expect(decrypt(ct, recovered)).toBe('shared note');
  });
});

describe('FEK encrypted with master key (DB storage)', () => {
  it('master key can wrap and unwrap a FEK', () => {
    const { contentKey, fek0 } = setupKeys();
    const fekHex = bytesToHex(fek0);
    // Encrypt the FEK hex string with master key (simulates encryptFeedKey)
    const wrappedFek = encrypt(fekHex, contentKey);
    expect(wrappedFek).not.toBe(fekHex);
    // Decrypt with master key (simulates decryptFeedKey)
    const unwrapped = decrypt(wrappedFek, contentKey);
    expect(unwrapped).toBe(fekHex);
    // The recovered key must encrypt/decrypt correctly
    const fek = hexToBytes(unwrapped);
    const ct = encrypt('test', fek);
    expect(decrypt(ct, fek)).toBe('test');
  });

  it('wrong master key cannot unwrap FEK', () => {
    const { contentKey, fek0 } = setupKeys();
    const wrongKey = new Uint8Array(32).fill(0xff);
    const wrapped = encrypt(bytesToHex(fek0), contentKey);
    expect(() => decrypt(wrapped, wrongKey)).toThrow();
  });
});

describe('multi-user scenario', () => {
  it('two users sharing the same FEK can read each others notes', () => {
    const { fek0 } = setupKeys();
    // User B has the same FEK (shared via invite payload)
    const sharedFek = fek0;

    const noteByA = encrypt('hello from A', sharedFek);
    const noteByB = encrypt('hello from B', sharedFek);

    expect(decrypt(noteByA, sharedFek)).toBe('hello from A');
    expect(decrypt(noteByB, sharedFek)).toBe('hello from B');
  });

  it('two users with different master keys produce different FEK for index 0', () => {
    const seedA = mnemonicToSeed(MNEMONIC);
    const seedB = mnemonicToSeed(
      'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong'
    );
    const fekA = deriveFeedKey(deriveKeys(seedA).masterHD, 0);
    const fekB = deriveFeedKey(deriveKeys(seedB).masterHD, 0);
    expect(bytesToHex(fekA)).not.toBe(bytesToHex(fekB));
  });
});
