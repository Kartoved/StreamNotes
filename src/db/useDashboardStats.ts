import { useEffect, useState } from 'react';
import { useDB } from './DBContext';
import { useCrypto } from '../crypto/CryptoContext';

export interface DashboardStats {
  todoToday: number;
  doingToday: number;
  doneToday: number;
  totalToday: number;
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function useDashboardStats(): DashboardStats {
  const db = useDB();
  const { decrypt, decryptForFeed } = useCrypto();
  const [stats, setStats] = useState<DashboardStats>({ todoToday: 0, doingToday: 0, doneToday: 0, totalToday: 0 });

  useEffect(() => {
    let cancelled = false;

    async function compute() {
      const today = todayStr();
      const rows = await db.execO(
        `SELECT properties, feed_id FROM notes WHERE is_deleted = 0 AND properties IS NOT NULL`
      ) as any[];

      let todoToday = 0, doingToday = 0, doneToday = 0;

      for (const row of rows) {
        if (!row.properties) continue;
        try {
          const dec = row.feed_id
            ? (s: string) => decryptForFeed(s, row.feed_id)
            : decrypt;
          const props = JSON.parse(dec(row.properties));
          if (!props.date || !props.status) continue;
          // date stored as YYYY-MM-DD or as ISO string
          const noteDate = props.date.slice(0, 10);
          if (noteDate !== today) continue;
          if (props.status === 'todo') todoToday++;
          else if (props.status === 'doing') doingToday++;
          else if (props.status === 'done') doneToday++;
        } catch {
          // skip notes that fail to decrypt (e.g. wrong key)
        }
      }

      if (!cancelled) {
        setStats({ todoToday, doingToday, doneToday, totalToday: todoToday + doingToday + doneToday });
      }
    }

    compute();

    // Re-compute on DB updates
    const unsub = db.onUpdate?.(() => compute());
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [db, decrypt, decryptForFeed]);

  return stats;
}
