import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { encrypt, decrypt } from '../../crypto/cipher';
import { encodeEvent, decodeEvent, type KeyResolver } from '../../sync/eventCodec';
import { SYNC_EVENT_KIND, type Changeset } from '../../sync/types';

const MASTER_KEY = new Uint8Array(32).fill(0x11);
const FEK = new Uint8Array(32).fill(0x22);
const OTHER_FEK = new Uint8Array(32).fill(0x33);

const masterEncrypt = (s: string) => encrypt(s, MASTER_KEY);
const masterDecrypt = (s: string) => decrypt(s, MASTER_KEY);
const fekEncrypt = (s: string) => encrypt(s, FEK);
const fekDecrypt = (s: string) => decrypt(s, FEK);
const otherFekDecrypt = (s: string) => decrypt(s, OTHER_FEK);

const secretKey = generateSecretKey();
const pubKey = getPublicKey(secretKey);

const sampleChangeset: Changeset = {
  v: 1,
  rows: [
    {
      table: 'notes',
      pk: 'YWJj',         // base64('abc')
      cid: 'content',
      val: 'hello world',
      col_version: 1,
      db_version: 1,
      site_id: 'c2l0ZQ==',
      cl: 1,
      seq: 0,
    },
  ],
};

describe('encodeEvent / decodeEvent — personal channel', () => {
  it('roundtrips through encryption + signing', () => {
    const event = encodeEvent({
      changeset: sampleChangeset,
      channel: 'personal',
      encrypt: masterEncrypt,
      secretKey,
    });

    expect(event.kind).toBe(SYNC_EVENT_KIND);
    expect(event.pubkey).toBe(pubKey);
    expect(event.sig).toBeTruthy();
    expect(event.tags.find((t) => t[0] === 'c')?.[1]).toBe('personal');
    expect(event.content.startsWith('enc1:')).toBe(true);

    const resolver: KeyResolver = (channel) =>
      channel === 'personal' ? masterDecrypt : null;
    const decoded = decodeEvent(event, resolver);
    expect(decoded).not.toBeNull();
    expect(decoded!.channel).toBe('personal');
    expect(decoded!.changeset.rows[0].cid).toBe('content');
    expect(decoded!.changeset.rows[0].val).toBe('hello world');
  });

  it('returns null when resolver provides no key', () => {
    const event = encodeEvent({
      changeset: sampleChangeset,
      channel: 'personal',
      encrypt: masterEncrypt,
      secretKey,
    });
    expect(decodeEvent(event, () => null)).toBeNull();
  });

  it('returns null when ciphertext is tampered', () => {
    const event = encodeEvent({
      changeset: sampleChangeset,
      channel: 'personal',
      encrypt: masterEncrypt,
      secretKey,
    });
    const tampered = { ...event, content: event.content.slice(0, -4) + 'AAAA' };
    expect(decodeEvent(tampered, () => masterDecrypt)).toBeNull();
  });
});

describe('encodeEvent / decodeEvent — feed channel', () => {
  it('carries the f tag and round-trips with the FEK', () => {
    const event = encodeEvent({
      changeset: sampleChangeset,
      channel: 'feed',
      feedId: 'feed-abc',
      encrypt: fekEncrypt,
      secretKey,
    });

    expect(event.tags.find((t) => t[0] === 'f')?.[1]).toBe('feed-abc');

    const resolver: KeyResolver = (channel, feedId) =>
      channel === 'feed' && feedId === 'feed-abc' ? fekDecrypt : null;
    const decoded = decodeEvent(event, resolver);
    expect(decoded?.feedId).toBe('feed-abc');
    expect(decoded?.changeset.rows[0].val).toBe('hello world');
  });

  it('rejects events when only the wrong FEK is held', () => {
    const event = encodeEvent({
      changeset: sampleChangeset,
      channel: 'feed',
      feedId: 'feed-abc',
      encrypt: fekEncrypt,
      secretKey,
    });
    const resolver: KeyResolver = () => otherFekDecrypt;
    expect(decodeEvent(event, resolver)).toBeNull();
  });

  it('throws if encoder is asked for a feed event without feedId', () => {
    expect(() =>
      encodeEvent({
        changeset: sampleChangeset,
        channel: 'feed',
        encrypt: fekEncrypt,
        secretKey,
      }),
    ).toThrow();
  });
});

describe('decodeEvent — defensive cases', () => {
  it('rejects events with the wrong kind', () => {
    const event = encodeEvent({
      changeset: sampleChangeset,
      channel: 'personal',
      encrypt: masterEncrypt,
      secretKey,
    });
    const wrongKind = { ...event, kind: 1 };
    expect(decodeEvent(wrongKind, () => masterDecrypt)).toBeNull();
  });

  it('rejects events with no channel tag', () => {
    const event = encodeEvent({
      changeset: sampleChangeset,
      channel: 'personal',
      encrypt: masterEncrypt,
      secretKey,
    });
    const stripped = { ...event, tags: event.tags.filter((t) => t[0] !== 'c') };
    expect(decodeEvent(stripped, () => masterDecrypt)).toBeNull();
  });
});
