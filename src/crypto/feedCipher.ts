// Feed-scoped encrypt/decrypt with a strict safety net.
//
// Rules:
//   - If a FEK is registered for the feed → use it.
//   - If no FEK AND the feed is known to be shared → throw FekMissingError.
//     Writing with the master key here would produce data that other
//     shared-feed members cannot decrypt, which is a silent data-loss bug.
//   - If no FEK AND the feed is not shared (or unknown) → use the master key.
//     This is the legitimate path for personal feeds, which never have a FEK.
//
// decryptForFeed is intentionally more permissive: legacy data encrypted
// with the master key (before per-feed keys existed) must still be readable.
// We warn once per feedId when falling back, to surface misconfiguration
// without spamming the console on every row of a rendered feed.

import { encrypt as rawEncrypt, decrypt as rawDecrypt } from './cipher';

export class FekMissingError extends Error {
  constructor(public readonly feedId: string) {
    super(`Encryption key for shared feed "${feedId}" is not loaded. Cannot encrypt.`);
    this.name = 'FekMissingError';
  }
}

export interface FeedCipherDeps {
  masterKey: Uint8Array;
  /** Returns FEK bytes if loaded in memory, null otherwise. */
  getFek: (feedId: string) => Uint8Array | null;
  /** Returns true if the feed is known to be shared (has encryption_key in DB). */
  isShared: (feedId: string) => boolean;
}

export interface FeedCipher {
  encryptForFeed: (plaintext: string, feedId: string) => string;
  decryptForFeed: (ciphertext: string, feedId: string) => string;
}

export function makeFeedCipher(deps: FeedCipherDeps): FeedCipher {
  const warnedFeeds = new Set<string>();
  return {
    encryptForFeed(plaintext, feedId) {
      const fek = deps.getFek(feedId);
      if (fek) return rawEncrypt(plaintext, fek);
      if (deps.isShared(feedId)) {
        throw new FekMissingError(feedId);
      }
      return rawEncrypt(plaintext, deps.masterKey);
    },
    decryptForFeed(ciphertext, feedId) {
      const fek = deps.getFek(feedId);
      if (fek) {
        try {
          return rawDecrypt(ciphertext, fek);
        } catch {
          // Legacy row encrypted with master key before per-feed keys — fall through.
        }
      } else if (deps.isShared(feedId) && !warnedFeeds.has(feedId)) {
        warnedFeeds.add(feedId);
        console.warn(
          `[crypto] decryptForFeed: FEK missing for shared feed ${feedId}, falling back to master key (may be legacy data).`,
        );
      }
      return rawDecrypt(ciphertext, deps.masterKey);
    },
  };
}
