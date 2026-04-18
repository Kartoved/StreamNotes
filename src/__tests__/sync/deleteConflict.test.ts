import { describe, it, expect } from 'vitest';
import { computeUndeletes, type ClockRow } from '../../sync/deleteConflict';

describe('computeUndeletes', () => {
  it('returns empty when no notes are deleted', () => {
    expect(computeUndeletes([], [])).toEqual([]);
  });

  it('undeletes when content col_version > is_deleted col_version', () => {
    const clock: ClockRow[] = [
      { noteId: 'n1', cid: 'is_deleted', colVersion: 1 },
      { noteId: 'n1', cid: 'content', colVersion: 2 },
    ];
    expect(computeUndeletes(['n1'], clock)).toEqual(['n1']);
  });

  it('keeps deleted when is_deleted col_version >= edit col_version', () => {
    const clock: ClockRow[] = [
      { noteId: 'n1', cid: 'is_deleted', colVersion: 5 },
      { noteId: 'n1', cid: 'content', colVersion: 3 },
    ];
    expect(computeUndeletes(['n1'], clock)).toEqual([]);
  });

  it('also triggers on properties edit', () => {
    const clock: ClockRow[] = [
      { noteId: 'n1', cid: 'is_deleted', colVersion: 1 },
      { noteId: 'n1', cid: 'properties', colVersion: 2 },
    ];
    expect(computeUndeletes(['n1'], clock)).toEqual(['n1']);
  });

  it('uses the MAX edit col_version across content and properties', () => {
    const clock: ClockRow[] = [
      { noteId: 'n1', cid: 'is_deleted', colVersion: 3 },
      { noteId: 'n1', cid: 'content', colVersion: 2 }, // lower than del
      { noteId: 'n1', cid: 'properties', colVersion: 4 }, // higher than del
    ];
    expect(computeUndeletes(['n1'], clock)).toEqual(['n1']);
  });

  it('ignores unrelated columns', () => {
    const clock: ClockRow[] = [
      { noteId: 'n1', cid: 'is_deleted', colVersion: 1 },
      { noteId: 'n1', cid: 'updated_at', colVersion: 99 },
    ];
    expect(computeUndeletes(['n1'], clock)).toEqual([]);
  });

  it('ignores notes that are not currently deleted', () => {
    const clock: ClockRow[] = [
      { noteId: 'n1', cid: 'is_deleted', colVersion: 1 },
      { noteId: 'n1', cid: 'content', colVersion: 2 },
    ];
    // n1 not in deleted set
    expect(computeUndeletes([], clock)).toEqual([]);
  });

  it('processes multiple notes independently', () => {
    const clock: ClockRow[] = [
      { noteId: 'n1', cid: 'is_deleted', colVersion: 1 },
      { noteId: 'n1', cid: 'content', colVersion: 2 }, // edit wins
      { noteId: 'n2', cid: 'is_deleted', colVersion: 3 },
      { noteId: 'n2', cid: 'content', colVersion: 1 }, // delete wins
      { noteId: 'n3', cid: 'is_deleted', colVersion: 2 },
      { noteId: 'n3', cid: 'properties', colVersion: 5 }, // edit wins
    ];
    const out = computeUndeletes(['n1', 'n2', 'n3'], clock).sort();
    expect(out).toEqual(['n1', 'n3']);
  });

  it('skips notes that have is_deleted but no edit columns tracked', () => {
    const clock: ClockRow[] = [
      { noteId: 'n1', cid: 'is_deleted', colVersion: 1 },
      // no edit rows at all
    ];
    expect(computeUndeletes(['n1'], clock)).toEqual([]);
  });
});
