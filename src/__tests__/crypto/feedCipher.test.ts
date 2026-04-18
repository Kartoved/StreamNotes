import { describe, it, expect, vi } from 'vitest';
import { makeFeedCipher, FekMissingError } from '../../crypto/feedCipher';
import { encrypt, decrypt } from '../../crypto/cipher';

const masterKey = new Uint8Array(32).fill(0xAA);
const fekA = new Uint8Array(32).fill(0xBB);

describe('makeFeedCipher', () => {
  it('encryptForFeed uses the feed FEK when registered', () => {
    const cipher = makeFeedCipher({
      masterKey,
      getFek: (id) => (id === 'feed-A' ? fekA : null),
      isShared: (id) => id === 'feed-A',
    });
    const ct = cipher.encryptForFeed('hello', 'feed-A');
    // Decryptable with FEK
    expect(decrypt(ct, fekA)).toBe('hello');
    // NOT decryptable with master key — proves FEK was actually used
    expect(() => decrypt(ct, masterKey)).toThrow();
  });

  it('encryptForFeed throws FekMissingError when FEK missing for shared feed', () => {
    const cipher = makeFeedCipher({
      masterKey,
      getFek: () => null,
      isShared: (id) => id === 'feed-A',
    });
    expect(() => cipher.encryptForFeed('x', 'feed-A')).toThrow(FekMissingError);
    try {
      cipher.encryptForFeed('x', 'feed-A');
    } catch (e) {
      expect((e as FekMissingError).feedId).toBe('feed-A');
    }
  });

  it('encryptForFeed falls back to master key for non-shared (personal) feed', () => {
    const cipher = makeFeedCipher({
      masterKey,
      getFek: () => null,
      isShared: () => false,
    });
    const ct = cipher.encryptForFeed('hello', 'feed-personal');
    expect(decrypt(ct, masterKey)).toBe('hello');
  });

  it('decryptForFeed uses FEK when registered', () => {
    const ct = encrypt('secret', fekA);
    const cipher = makeFeedCipher({
      masterKey,
      getFek: () => fekA,
      isShared: () => true,
    });
    expect(cipher.decryptForFeed(ct, 'feed-A')).toBe('secret');
  });

  it('decryptForFeed falls back to master key when FEK-registered feed has legacy data', () => {
    const legacyCt = encrypt('legacy-row', masterKey);
    const cipher = makeFeedCipher({
      masterKey,
      getFek: () => fekA,
      isShared: () => true,
    });
    // FEK is registered, but this row was encrypted with master key.
    // decryptForFeed should silently fall back.
    expect(cipher.decryptForFeed(legacyCt, 'feed-A')).toBe('legacy-row');
  });

  it('decryptForFeed warns exactly once per shared feed when FEK missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* noop */ });
    const ct = encrypt('legacy', masterKey);
    const cipher = makeFeedCipher({
      masterKey,
      getFek: () => null,
      isShared: () => true,
    });

    cipher.decryptForFeed(ct, 'feed-A');
    cipher.decryptForFeed(ct, 'feed-A');
    cipher.decryptForFeed(ct, 'feed-A');
    expect(warn).toHaveBeenCalledTimes(1);

    // Different feed — gets its own warning
    cipher.decryptForFeed(ct, 'feed-B');
    expect(warn).toHaveBeenCalledTimes(2);

    warn.mockRestore();
  });

  it('decryptForFeed does NOT warn for personal (non-shared) feed without FEK', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* noop */ });
    const ct = encrypt('hi', masterKey);
    const cipher = makeFeedCipher({
      masterKey,
      getFek: () => null,
      isShared: () => false,
    });
    cipher.decryptForFeed(ct, 'feed-personal');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
