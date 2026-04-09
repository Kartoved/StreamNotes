import { useEffect, useState } from 'react';
import { useDB } from './DBContext';
import { useCrypto } from '../crypto/CryptoContext';

export interface DashboardStats {
  todoToday: number;
  doingToday: number;
  doneToday: number;
  totalToday: number;
  somedayCount: number;
  futureCount: number;
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function useDashboardStats(feedId: string | null): DashboardStats {
  const db = useDB();
  const { decrypt, decryptForFeed } = useCrypto();
  const [stats, setStats] = useState<DashboardStats>({
    todoToday: 0,
    doingToday: 0,
    doneToday: 0,
    totalToday: 0,
    somedayCount: 0,
    futureCount: 0
  });

  useEffect(() => {
    let cancelled = false;

    // Reset immediately on feedId change before async query completes
    setStats({
      todoToday: 0,
      doingToday: 0,
      doneToday: 0,
      totalToday: 0,
      somedayCount: 0,
      futureCount: 0
    });

    async function compute() {
      const today = todayStr();
      const rows = await db.execO(
        feedId
          ? `SELECT properties, feed_id FROM notes WHERE is_deleted = 0 AND properties IS NOT NULL AND feed_id = ?`
          : `SELECT properties, feed_id FROM notes WHERE is_deleted = 0 AND properties IS NOT NULL`,
        feedId ? [feedId] : []
      ) as any[];

      let todoToday = 0, doingToday = 0, doneToday = 0;
      let somedayCount = 0, futureCount = 0;

      for (const row of rows) {
        if (!row.properties) continue;
        try {
          const dec = row.feed_id
            ? (s: string) => decryptForFeed(s, row.feed_id)
            : decrypt;
          const props = JSON.parse(dec(row.properties));
          const status = props.status;
          if (!status || status === 'none' || status === 'archived') continue;

          if (status === 'todo') {
            const noteDate = props.date ? props.date.slice(0, 10) : null;
            if (!noteDate) {
              somedayCount++;
              // Also include in todoToday? 
              // Usually "Today" view includes tasks without date as they are "available" to do.
              // But the user asked for a separate filter for "tasks without a date".
              // Let's keep todoToday as "available tasks" (no date or date <= today)
              todoToday++;
            } else if (noteDate <= today) {
              todoToday++;
            } else {
              futureCount++;
            }
          } else if (status === 'doing') {
            doingToday++;
          } else if (status === 'done') {
            const completedAt = props.completed_at ? props.completed_at.slice(0, 10) : null;
            if (completedAt === today) doneToday++;
          }
        } catch {
          // skip notes that fail to decrypt
        }
      }

      if (!cancelled) {
        setStats({
          todoToday,
          doingToday,
          doneToday,
          totalToday: todoToday + doingToday + doneToday,
          somedayCount,
          futureCount
        });
      }
    }

    compute();

    // Re-compute on DB updates
    const unsub = db.onUpdate((_: any, __: any, tblName: string) => {
      if (tblName === 'notes' || tblName === 'crsql_changes') compute();
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [db, decrypt, decryptForFeed, feedId]);

  return stats;
}
