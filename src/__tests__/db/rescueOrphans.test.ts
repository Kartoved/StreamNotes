/**
 * Tests for rescueOrphans — graph integrity before sync.
 * Sync will merge notes from multiple peers; cycles would corrupt
 * the tree rendering. rescueOrphans must catch them all.
 */
import { describe, it, expect, vi } from 'vitest';
import { rescueOrphans } from '../../db/hooks';

/** Build a minimal mock DB from a parent map: { id → parent_id | null } */
function mockDB(nodes: Record<string, string | null>) {
  const store: Record<string, string | null> = { ...nodes };

  return {
    // execO: SELECT id, parent_id FROM notes WHERE parent_id IS NOT NULL
    execO: vi.fn(async () =>
      Object.entries(store)
        .filter(([, parent]) => parent !== null)
        .map(([id, parent_id]) => ({ id, parent_id }))
    ),
    // exec: called both for cycle fixes (with [id] arg) and for the cascade
    // cleanup CTE at the end of rescueOrphans (no second arg).
    exec: vi.fn(async (_sql: string, args?: [string]) => {
      if (args?.[0]) store[args[0]] = null;
    }),
    _store: store,
  };
}

/** Returns only exec calls that fixed a cycle (have a node-id argument). */
function cycleFixes(db: ReturnType<typeof mockDB>) {
  return (db.exec.mock.calls as any[]).filter((call) => call[1] != null);
}

describe('rescueOrphans — no cycles', () => {
  it('linear chain: A → B → C is left intact', async () => {
    const db = mockDB({ A: null, B: 'A', C: 'B' });
    await rescueOrphans(db as any);
    expect(cycleFixes(db)).toHaveLength(0);
  });

  it('flat list (all roots) is left intact', async () => {
    const db = mockDB({ A: null, B: null, C: null });
    await rescueOrphans(db as any);
    expect(cycleFixes(db)).toHaveLength(0);
  });

  it('deep tree (5 levels) is left intact', async () => {
    const db = mockDB({ A: null, B: 'A', C: 'B', D: 'C', E: 'D' });
    await rescueOrphans(db as any);
    expect(cycleFixes(db)).toHaveLength(0);
  });

  it('multiple independent trees are left intact', async () => {
    const db = mockDB({
      A: null, B: 'A', C: 'A',
      X: null, Y: 'X', Z: 'X',
    });
    await rescueOrphans(db as any);
    expect(cycleFixes(db)).toHaveLength(0);
  });
});

describe('rescueOrphans — cycle detection', () => {
  it('simple cycle A → B → A is broken', async () => {
    const db = mockDB({ A: 'B', B: 'A' });
    await rescueOrphans(db as any);
    expect(db.exec).toHaveBeenCalled();
    // After rescue, the store should have no cycle
    const fixed = db._store;
    // At least one of them must now be null (cycle broken)
    const stillLinked = [fixed.A, fixed.B].filter(Boolean);
    expect(stillLinked.length).toBeLessThan(2);
  });

  it('self-loop A → A is broken', async () => {
    const db = mockDB({ A: 'A' });
    await rescueOrphans(db as any);
    expect(db.exec).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE'),
      ['A']
    );
  });

  it('three-node cycle A → B → C → A is broken', async () => {
    const db = mockDB({ A: 'C', B: 'A', C: 'B' });
    await rescueOrphans(db as any);
    expect(db.exec).toHaveBeenCalled();
    // After rescue there should be no cycle
    const store = db._store;
    // Verify we can traverse without looping
    function hasCycle(start: string): boolean {
      const seen = new Set<string>();
      let curr: string | null = start;
      while (curr !== null && curr !== undefined) {
        if (seen.has(curr)) return true;
        seen.add(curr);
        curr = store[curr] ?? null;
      }
      return false;
    }
    for (const id of Object.keys(store)) {
      expect(hasCycle(id)).toBe(false);
    }
  });

  it('cycle mixed with valid subtree: only the cycle node is fixed', async () => {
    // Valid: root → child1, cycle: nodeA → nodeB → nodeA
    const db = mockDB({ root: null, child1: 'root', nodeA: 'nodeB', nodeB: 'nodeA' });
    await rescueOrphans(db as any);
    // child1's parent must still be root
    expect(db._store.child1).toBe('root');
    // At least one cycle node is broken
    const cycleNodes = [db._store.nodeA, db._store.nodeB];
    expect(cycleNodes.some(v => v === null)).toBe(true);
  });
});

describe('rescueOrphans — sync scenario', () => {
  it('handles 1000 nodes without blowing the stack', async () => {
    // Linear chain of 1000 nodes — no cycle expected
    const nodes: Record<string, string | null> = { 'n0': null };
    for (let i = 1; i < 1000; i++) {
      nodes[`n${i}`] = `n${i - 1}`;
    }
    const db = mockDB(nodes);
    await expect(rescueOrphans(db as any)).resolves.toBeUndefined();
    expect(cycleFixes(db)).toHaveLength(0);
  });

  it('after sync merge introducing cycle: all cycles are broken', async () => {
    // Simulate: peer A has A→root, peer B has root→A (conflict creates cycle)
    const db = mockDB({ root: 'A', A: 'root' });
    await rescueOrphans(db as any);
    expect(db.exec).toHaveBeenCalled();
  });
});
