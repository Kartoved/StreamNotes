import { useEffect, useState } from 'react';
import { useDB } from './DBContext';
import { useCrypto } from '../crypto/CryptoContext';

export interface SkillTotal {
  name: string;
  totalXp: number;
  doneCount: number;
}

export interface SkillStats {
  totals: SkillTotal[];
  grandTotalXp: number;
}

const EMPTY: SkillStats = { totals: [], grandTotalXp: 0 };

// Aggregates total XP per skill across all non-deleted notes whose status is 'done'.
// XP is derived from current state — toggling done off subtracts immediately,
// editing XP applies retroactively. No ledger, no historical record.
export function useSkillStats(): SkillStats {
  const db = useDB();
  const { decrypt, decryptForFeed } = useCrypto();
  const [stats, setStats] = useState<SkillStats>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    async function compute() {
      const rows = await db.execO(
        `SELECT properties, feed_id FROM notes WHERE is_deleted = 0 AND properties IS NOT NULL`
      ) as any[];

      const map = new Map<string, { totalXp: number; doneCount: number }>();

      for (const row of rows) {
        if (!row.properties) continue;
        try {
          const dec = row.feed_id
            ? (s: string) => decryptForFeed(s, row.feed_id)
            : decrypt;
          const p = JSON.parse(dec(row.properties));
          if (p.status === 'note' || p.kind === 'note') continue;
          if (p.status !== 'done') continue;
          const skill = p.skill;
          if (!skill || typeof skill.name !== 'string' || typeof skill.xp !== 'number') continue;
          const name = skill.name;
          const cur = map.get(name) || { totalXp: 0, doneCount: 0 };
          cur.totalXp += Math.max(0, Math.floor(skill.xp));
          cur.doneCount += 1;
          map.set(name, cur);
        } catch {
          // Skip rows that fail to decrypt.
        }
      }

      const totals: SkillTotal[] = [...map.entries()]
        .map(([name, v]) => ({ name, totalXp: v.totalXp, doneCount: v.doneCount }))
        .sort((a, b) => b.totalXp - a.totalXp);
      const grandTotalXp = totals.reduce((s, t) => s + t.totalXp, 0);

      if (!cancelled) setStats({ totals, grandTotalXp });
    }

    compute();
    const unsub = db.onUpdate((_: any, __: any, tblName: string) => {
      if (tblName === 'notes' || tblName === 'crsql_changes') compute();
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [db, decrypt, decryptForFeed]);

  return stats;
}
