// Encode/decode StreamNotes sync events on top of Nostr.
//
// A sync event is a regular Nostr event of kind 1314 whose `content` is the
// existing `enc1:` ciphertext blob (XChaCha20-Poly1305) wrapping the JSON
// changeset. Tags carry routing info (channel + optional feed_id) so the
// receiver can pick the right key.

import { finalizeEvent } from 'nostr-tools/pure';
import type { Event, EventTemplate } from 'nostr-tools/core';
import type { Channel, Changeset } from './types';
import { SYNC_EVENT_KIND } from './types';

export interface EncodeInput {
  changeset: Changeset;
  channel: Channel;
  feedId?: string;
  /** Encrypts plaintext with the appropriate key (master or FEK). */
  encrypt: (plaintext: string) => string;
  /** 32-byte schnorr secret key (Nostr private key). */
  secretKey: Uint8Array;
}

/** Resolves the right decryptor based on the event's tags. */
export type KeyResolver = (channel: Channel, feedId: string | undefined) => ((ciphertext: string) => string) | null;

/** Build a signed Nostr event carrying an encrypted changeset. */
export function encodeEvent({ changeset, channel, feedId, encrypt, secretKey }: EncodeInput): Event {
  const tags: string[][] = [['c', channel]];
  if (channel === 'feed') {
    if (!feedId) throw new Error('feed channel requires feedId');
    tags.push(['f', feedId]);
  }

  const plaintext = JSON.stringify(changeset);
  const ciphertext = encrypt(plaintext);

  const template: EventTemplate = {
    kind: SYNC_EVENT_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: ciphertext,
  };

  return finalizeEvent(template, secretKey);
}

/**
 * Decode (decrypt + parse) a Nostr event into a changeset.
 *
 * Returns null if:
 *   - the kind doesn't match
 *   - we don't hold the right key (resolver returned null)
 *   - decryption fails (tampered or wrong key)
 *   - JSON parsing fails or version is unknown
 */
export function decodeEvent(event: Event, resolveKey: KeyResolver): { changeset: Changeset; channel: Channel; feedId?: string } | null {
  if (event.kind !== SYNC_EVENT_KIND) return null;

  let channel: Channel | null = null;
  let feedId: string | undefined;
  for (const t of event.tags) {
    if (t[0] === 'c' && (t[1] === 'personal' || t[1] === 'feed')) channel = t[1];
    else if (t[0] === 'f') feedId = t[1];
  }
  if (!channel) return null;
  if (channel === 'feed' && !feedId) return null;

  const decrypt = resolveKey(channel, feedId);
  if (!decrypt) return null;

  let plaintext: string;
  try {
    plaintext = decrypt(event.content);
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as { v?: unknown }).v !== 1 ||
    !Array.isArray((parsed as { rows?: unknown }).rows)
  ) {
    return null;
  }

  return { changeset: parsed as Changeset, channel, feedId };
}
