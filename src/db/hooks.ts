import { useEffect, useState } from 'react';
import { useDB } from './DBContext';
import { useCrypto } from '../crypto/CryptoContext';

export interface Note {
  id: string;
  parent_id: string | null;
  author_id: string;
  content: string;
  sort_key: string;
  properties: string;
  view_mode: string;
  feed_id: string | null;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  depth: number;
}

export interface Feed {
  id: string;
  name: string;
  avatar: string | null;
  color: string;
  encryption_key: string | null;
  key_index: number | null;
  is_shared: number;
  created_at: number;
}

// Защита целостности графа
export async function rescueOrphans(db: any) {
  const all = await db.execO(`SELECT id, parent_id FROM notes WHERE parent_id IS NOT NULL`);
  const parentMap = new Map<string, string | null>();
  all.forEach((n: any) => parentMap.set(n.id, n.parent_id));

  let cyclesFixed = 0;
  for (const node of all) {
    let curr = node.parent_id;
    const seen = new Set([node.id]);
    while (curr) {
      if (seen.has(curr)) {
        await db.exec(`UPDATE notes SET parent_id = NULL WHERE id = ?`, [node.id]);
        cyclesFixed++;
        break;
      }
      seen.add(curr);
      curr = parentMap.get(curr) || null;
    }
  }
  if (cyclesFixed > 0) {
    console.warn(`Внимание: разорвано ${cyclesFixed} циклических ссылок.`);
  }
}

export function useNotes(parentId: string | null = null, feedId: string | null = null) {
  const db = useDB();
  const { decryptForFeed, decrypt } = useCrypto();
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    let isMounted = true;

    const fetchNotes = async () => {
      let query: string;
      let params: any[];

      if (parentId) {
        query = `WITH RECURSIVE
            thread_tree AS (
              SELECT *, 0 as depth, created_at as root_created_at, sort_key as path_str
              FROM notes
              WHERE id = ? AND is_deleted = 0
              UNION ALL
              SELECT n.*, tt.depth + 1, tt.root_created_at, tt.path_str || '/' || n.sort_key
              FROM notes n
              JOIN thread_tree tt ON n.parent_id = tt.id
              WHERE n.is_deleted = 0
            )
          SELECT * FROM thread_tree
          ORDER BY root_created_at DESC, path_str ASC;`;
        params = [parentId];
      } else if (feedId) {
        query = `WITH RECURSIVE
            thread_tree AS (
              SELECT *, 0 as depth, created_at as root_created_at, sort_key as path_str
              FROM notes
              WHERE parent_id IS NULL AND is_deleted = 0 AND feed_id = ?
              UNION ALL
              SELECT n.*, tt.depth + 1, tt.root_created_at, tt.path_str || '/' || n.sort_key
              FROM notes n
              JOIN thread_tree tt ON n.parent_id = tt.id
              WHERE n.is_deleted = 0
            )
          SELECT * FROM thread_tree
          ORDER BY root_created_at DESC, path_str ASC;`;
        params = [feedId];
      } else {
        query = `WITH RECURSIVE
            thread_tree AS (
              SELECT *, 0 as depth, created_at as root_created_at, sort_key as path_str
              FROM notes
              WHERE parent_id IS NULL AND is_deleted = 0
              UNION ALL
              SELECT n.*, tt.depth + 1, tt.root_created_at, tt.path_str || '/' || n.sort_key
              FROM notes n
              JOIN thread_tree tt ON n.parent_id = tt.id
              WHERE n.is_deleted = 0
            )
          SELECT * FROM thread_tree
          ORDER BY root_created_at DESC, path_str ASC;`;
        params = [];
      }

      const res = await db.execO(query, params);
      const decrypted = (res as Note[]).map(row => {
        const fid = row.feed_id || feedId;
        const dec = fid ? (s: string) => decryptForFeed(s, fid) : decrypt;
        return {
          ...row,
          content: dec(row.content),
          properties: dec(row.properties),
        };
      });
      if (isMounted) setNotes(decrypted);
    };

    fetchNotes();

    const cleanup = db.onUpdate((_: any, __: any, tblName: string) => {
      if (tblName === 'notes') fetchNotes();
    });

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [db, parentId, feedId]);

  return notes;
}

export function useFeeds() {
  const db = useDB();
  const { decrypt, decryptFeedKey, registerFeedKey } = useCrypto();
  const [feeds, setFeeds] = useState<Feed[]>([]);

  useEffect(() => {
    let isMounted = true;

    const fetchFeeds = async () => {
      const res = await db.execO(`SELECT * FROM feeds ORDER BY created_at ASC`);
      const decrypted = (res as Feed[]).map(row => {
        // Decrypt the FEK and register it in the in-memory cache
        if (row.encryption_key) {
          try {
            const fekHex = decryptFeedKey(row.encryption_key);
            registerFeedKey(row.id, fekHex);
          } catch { /* corrupt key — will fallback to master */ }
        }
        return {
          ...row,
          name: decrypt(row.name),
          avatar: row.avatar ? decrypt(row.avatar) : null,
        };
      });
      if (isMounted) setFeeds(decrypted);
    };

    fetchFeeds();

    const cleanup = db.onUpdate((_: any, __: any, tblName: string) => {
      if (tblName === 'feeds') fetchFeeds();
    });

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [db]);

  return feeds;
}
