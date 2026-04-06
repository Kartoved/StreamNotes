/**
 * Tests for the invite payload (Share Flow) protocol.
 *
 * The payload is the only mechanism for out-of-band key exchange.
 * If it's broken, two peers can never communicate — so we test:
 *   - required fields are present
 *   - the FEK inside is a valid 32-byte key
 *   - the FEK works for encrypt/decrypt
 *   - a recipient who imports the payload can read the sharer's notes
 */
import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../../crypto/cipher';
import { deriveKeys, deriveFeedKey } from '../../crypto/keys';
import { mnemonicToSeed } from '../../crypto/bip39';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

const MNEMONIC_A =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const MNEMONIC_B =
  'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';

function buildSharePayload(mnemonic: string, keyIndex: number, feedId: string, feedName: string) {
  const seed = mnemonicToSeed(mnemonic);
  const { masterHD, nostrPubKey } = deriveKeys(seed);
  const fek = deriveFeedKey(masterHD, keyIndex);
  return {
    flow_id: feedId,
    fek: bytesToHex(fek),
    name: feedName,
    author_npub: nostrPubKey,
  };
}

describe('invite payload structure', () => {
  it('contains all required fields', () => {
    const payload = buildSharePayload(MNEMONIC_A, 0, 'feed-abc123', 'My Flow');
    expect(payload).toHaveProperty('flow_id');
    expect(payload).toHaveProperty('fek');
    expect(payload).toHaveProperty('name');
    expect(payload).toHaveProperty('author_npub');
  });

  it('fek is a 64-char hex string (32 bytes)', () => {
    const payload = buildSharePayload(MNEMONIC_A, 0, 'feed-abc123', 'My Flow');
    expect(payload.fek).toMatch(/^[0-9a-f]{64}$/);
  });

  it('author_npub is a 64-char hex string', () => {
    const payload = buildSharePayload(MNEMONIC_A, 0, 'feed-abc123', 'My Flow');
    expect(payload.author_npub).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is JSON-serializable and parseable', () => {
    const payload = buildSharePayload(MNEMONIC_A, 0, 'feed-abc123', 'My Flow');
    const json = JSON.stringify(payload);
    const parsed = JSON.parse(json);
    expect(parsed.flow_id).toBe(payload.flow_id);
    expect(parsed.fek).toBe(payload.fek);
  });

  it('same sharer generates identical fek for same index', () => {
    const p1 = buildSharePayload(MNEMONIC_A, 0, 'feed-1', 'Flow');
    const p2 = buildSharePayload(MNEMONIC_A, 0, 'feed-1', 'Flow');
    expect(p1.fek).toBe(p2.fek);
  });

  it('different indices produce different feks', () => {
    const p0 = buildSharePayload(MNEMONIC_A, 0, 'feed-0', 'F');
    const p1 = buildSharePayload(MNEMONIC_A, 1, 'feed-1', 'F');
    expect(p0.fek).not.toBe(p1.fek);
  });
});

describe('collaboration: sharer writes, recipient reads', () => {
  it('recipient can decrypt sharer note using payload FEK', () => {
    // Sharer: User A creates a note in feed-0
    const payloadA = buildSharePayload(MNEMONIC_A, 0, 'feed-shared', 'Collab');
    const fekA = hexToBytes(payloadA.fek);
    const note = encrypt('Hello from User A!', fekA);

    // Recipient: User B receives payload and imports the FEK
    const importedFek = hexToBytes(payloadA.fek);
    expect(decrypt(note, importedFek)).toBe('Hello from User A!');
  });

  it('recipient can write notes decryptable by sharer', () => {
    const payloadA = buildSharePayload(MNEMONIC_A, 0, 'feed-shared', 'Collab');
    const sharedFek = hexToBytes(payloadA.fek);

    // User B writes a note
    const seedB = mnemonicToSeed(MNEMONIC_B);
    const { nostrPubKey: npubB } = deriveKeys(seedB);
    const noteByB = encrypt(`Reply from ${npubB.slice(0, 8)}`, sharedFek);

    // User A (sharer) reads it
    expect(decrypt(noteByB, sharedFek)).toContain('Reply from');
  });

  it('notes from two different authors are both readable with shared FEK', () => {
    const payload = buildSharePayload(MNEMONIC_A, 0, 'feed-shared', 'Group');
    const fek = hexToBytes(payload.fek);

    const notes = [
      encrypt('Note by A — first', fek),
      encrypt('Note by B — response', fek),
      encrypt('Note by A — follow up', fek),
    ];

    const decrypted = notes.map(n => decrypt(n, fek));
    expect(decrypted[0]).toBe('Note by A — first');
    expect(decrypted[1]).toBe('Note by B — response');
    expect(decrypted[2]).toBe('Note by A — follow up');
  });

  it("recipient cannot read sharer's private feeds (different FEK)", () => {
    // Shared feed (index 0) was shared
    const sharedPayload = buildSharePayload(MNEMONIC_A, 0, 'feed-shared', 'Shared');
    const sharedFek = hexToBytes(sharedPayload.fek);

    // Private feed (index 1) was NOT shared
    const seedA = mnemonicToSeed(MNEMONIC_A);
    const { masterHD } = deriveKeys(seedA);
    const privateFek = deriveFeedKey(masterHD, 1);

    const privateNote = encrypt('Private note of A', privateFek);

    // Recipient uses the shared FEK
    expect(() => decrypt(privateNote, sharedFek)).toThrow();
  });
});

describe('payload validation (simulates import UI)', () => {
  function validatePayload(raw: unknown): raw is { flow_id: string; fek: string; name: string } {
    if (typeof raw !== 'object' || raw === null) return false;
    const p = raw as Record<string, unknown>;
    return (
      typeof p.flow_id === 'string' && p.flow_id.length > 0 &&
      typeof p.fek === 'string' && /^[0-9a-f]{64}$/.test(p.fek) &&
      typeof p.name === 'string'
    );
  }

  it('accepts a valid payload', () => {
    const payload = buildSharePayload(MNEMONIC_A, 0, 'feed-1', 'Test');
    expect(validatePayload(payload)).toBe(true);
  });

  it('rejects missing flow_id', () => {
    const p = buildSharePayload(MNEMONIC_A, 0, 'feed-1', 'Test');
    expect(validatePayload({ ...p, flow_id: undefined })).toBe(false);
  });

  it('rejects missing fek', () => {
    const p = buildSharePayload(MNEMONIC_A, 0, 'feed-1', 'Test');
    expect(validatePayload({ ...p, fek: undefined })).toBe(false);
  });

  it('rejects truncated fek (not 64 chars)', () => {
    const p = buildSharePayload(MNEMONIC_A, 0, 'feed-1', 'Test');
    expect(validatePayload({ ...p, fek: p.fek.slice(0, 32) })).toBe(false);
  });

  it('rejects non-hex fek', () => {
    const p = buildSharePayload(MNEMONIC_A, 0, 'feed-1', 'Test');
    expect(validatePayload({ ...p, fek: 'z'.repeat(64) })).toBe(false);
  });

  it('rejects null input', () => {
    expect(validatePayload(null)).toBe(false);
    expect(validatePayload(undefined)).toBe(false);
    expect(validatePayload('raw string')).toBe(false);
  });
});
