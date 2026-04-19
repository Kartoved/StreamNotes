import { describe, it, expect } from 'vitest';
import { encodeInviteLink, decodeInviteLink, hashHasInvite, type InvitePayload } from '../../sharing/inviteLink';

const VALID_FEK = 'a'.repeat(64);

const basePayload: InvitePayload = {
  flow_id: 'feed-abc123',
  fek: VALID_FEK,
  name: 'My Flow',
  author_npub: 'b'.repeat(64),
  role: 'participant',
};

describe('encodeInviteLink / decodeInviteLink', () => {
  it('roundtrips a minimal payload', () => {
    const url = encodeInviteLink(basePayload, 'https://sheafy.app');
    expect(url).toContain('https://sheafy.app/invite#i=');
    const back = decodeInviteLink(url);
    expect(back).toEqual(basePayload);
  });

  it('strips notes/links snapshots from the link (lean mode)', () => {
    const fat: InvitePayload = { ...basePayload, notes: [1, 2, 3], links: [{ a: 1 }] };
    const url = encodeInviteLink(fat, 'https://sheafy.app');
    const back = decodeInviteLink(url)!;
    expect(back.notes).toBeUndefined();
    expect(back.links).toBeUndefined();
    // FEK and flow_id survive
    expect(back.fek).toBe(VALID_FEK);
    expect(back.flow_id).toBe('feed-abc123');
  });

  it('preserves unicode in name', () => {
    const p = { ...basePayload, name: 'Проект 🚀 «Шифлоу»' };
    const url = encodeInviteLink(p, 'https://x.test');
    expect(decodeInviteLink(url)!.name).toBe('Проект 🚀 «Шифлоу»');
  });

  it('trims trailing slash from origin', () => {
    const url = encodeInviteLink(basePayload, 'https://sheafy.app/');
    expect(url).toContain('https://sheafy.app/invite#');
    expect(url).not.toContain('app//invite');
  });

  it('returns null for non-invite URLs', () => {
    expect(decodeInviteLink('https://sheafy.app/')).toBeNull();
    expect(decodeInviteLink('https://sheafy.app/invite')).toBeNull();
    expect(decodeInviteLink('https://sheafy.app/invite#other=data')).toBeNull();
  });

  it('returns null for corrupted base64', () => {
    expect(decodeInviteLink('https://sheafy.app/invite#i=!!!not-base64!!!')).toBeNull();
  });

  it('returns null for JSON missing required fields', () => {
    const bad = btoa(JSON.stringify({ flow_id: 'x' })).replace(/=+$/, '');
    expect(decodeInviteLink(`https://sheafy.app/invite#i=${bad}`)).toBeNull();
  });

  it('returns null when fek is not 64 hex chars', () => {
    const bad = btoa(JSON.stringify({ flow_id: 'f', fek: 'short', name: 'n' })).replace(/=+$/, '');
    expect(decodeInviteLink(`https://sheafy.app/invite#i=${bad}`)).toBeNull();
  });

  it('accepts a bare fragment (for location.hash handling)', () => {
    const url = encodeInviteLink(basePayload, 'https://sheafy.app');
    const fragment = url.slice(url.indexOf('#'));
    expect(decodeInviteLink(fragment)).toEqual(basePayload);
  });
});

describe('hashHasInvite', () => {
  it('detects invite fragment', () => {
    expect(hashHasInvite('#i=abc')).toBe(true);
    expect(hashHasInvite('i=abc')).toBe(true);
  });

  it('ignores other hash content', () => {
    expect(hashHasInvite('')).toBe(false);
    expect(hashHasInvite('#')).toBe(false);
    expect(hashHasInvite('#some-anchor')).toBe(false);
    expect(hashHasInvite('#x=y')).toBe(false);
  });
});
