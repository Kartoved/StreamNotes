import { describe, it, expect } from 'vitest';
import { deriveKeys, deriveFeedKey, generateRandomFeedKey } from '../../crypto/keys';
import { generateMnemonic, mnemonicToSeed } from '../../crypto/bip39';
import { bytesToHex } from '@noble/hashes/utils';
import { schnorr } from '@noble/curves/secp256k1';

// Fixed test mnemonic — never use in production
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function seedFromMnemonic(m = TEST_MNEMONIC) {
  return mnemonicToSeed(m);
}

describe('deriveKeys — determinism', () => {
  it('produces the same nostrPubKey from the same seed', () => {
    const seed = seedFromMnemonic();
    const a = deriveKeys(seed);
    const b = deriveKeys(seed);
    expect(a.nostrPubKey).toBe(b.nostrPubKey);
  });

  it('produces the same contentKey from the same seed', () => {
    const seed = seedFromMnemonic();
    const a = deriveKeys(seed);
    const b = deriveKeys(seed);
    expect(bytesToHex(a.contentKey)).toBe(bytesToHex(b.contentKey));
  });

  it('produces different keys from different seeds', () => {
    const mnemonic2 = generateMnemonic();
    const seedA = seedFromMnemonic();
    const seedB = seedFromMnemonic(mnemonic2);
    const a = deriveKeys(seedA);
    const b = deriveKeys(seedB);
    expect(a.nostrPubKey).not.toBe(b.nostrPubKey);
    expect(bytesToHex(a.contentKey)).not.toBe(bytesToHex(b.contentKey));
  });

  it('nostrPubKey is a 64-char hex string (32 bytes)', () => {
    const seed = seedFromMnemonic();
    const { nostrPubKey } = deriveKeys(seed);
    expect(nostrPubKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('contentKey is 32 bytes', () => {
    const seed = seedFromMnemonic();
    const { contentKey } = deriveKeys(seed);
    expect(contentKey.length).toBe(32);
  });

  it('nostrPrivKey matches nostrPubKey (schnorr)', () => {
    const seed = seedFromMnemonic();
    const { nostrPrivKey, nostrPubKey } = deriveKeys(seed);
    const derived = bytesToHex(schnorr.getPublicKey(nostrPrivKey));
    expect(derived).toBe(nostrPubKey);
  });
});

describe('deriveFeedKey — determinism & isolation', () => {
  it('same seed + same index → same FEK', () => {
    const { masterHD } = deriveKeys(seedFromMnemonic());
    const fek0a = deriveFeedKey(masterHD, 0);
    const fek0b = deriveFeedKey(masterHD, 0);
    expect(bytesToHex(fek0a)).toBe(bytesToHex(fek0b));
  });

  it('different indices → different FEKs', () => {
    const { masterHD } = deriveKeys(seedFromMnemonic());
    const fek0 = deriveFeedKey(masterHD, 0);
    const fek1 = deriveFeedKey(masterHD, 1);
    const fek2 = deriveFeedKey(masterHD, 2);
    expect(bytesToHex(fek0)).not.toBe(bytesToHex(fek1));
    expect(bytesToHex(fek1)).not.toBe(bytesToHex(fek2));
    expect(bytesToHex(fek0)).not.toBe(bytesToHex(fek2));
  });

  it('FEK is different from the master contentKey', () => {
    const seed = seedFromMnemonic();
    const { masterHD, contentKey } = deriveKeys(seed);
    const fek = deriveFeedKey(masterHD, 0);
    expect(bytesToHex(fek)).not.toBe(bytesToHex(contentKey));
  });

  it('FEK from different seeds are different (same index)', () => {
    const seedA = seedFromMnemonic();
    const seedB = seedFromMnemonic(generateMnemonic());
    const fekA = deriveFeedKey(deriveKeys(seedA).masterHD, 0);
    const fekB = deriveFeedKey(deriveKeys(seedB).masterHD, 0);
    expect(bytesToHex(fekA)).not.toBe(bytesToHex(fekB));
  });

  it('FEK is 32 bytes', () => {
    const { masterHD } = deriveKeys(seedFromMnemonic());
    const fek = deriveFeedKey(masterHD, 0);
    expect(fek.length).toBe(32);
  });

  it('supports large key indices (sync scenario: many feeds)', () => {
    const { masterHD } = deriveKeys(seedFromMnemonic());
    // Should not throw for high indices
    expect(() => deriveFeedKey(masterHD, 999)).not.toThrow();
    const fek = deriveFeedKey(masterHD, 999);
    expect(fek.length).toBe(32);
  });
});

describe('generateRandomFeedKey', () => {
  it('returns 32 bytes', () => {
    const fek = generateRandomFeedKey();
    expect(fek.length).toBe(32);
  });

  it('is different on each call', () => {
    const a = generateRandomFeedKey();
    const b = generateRandomFeedKey();
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });
});
