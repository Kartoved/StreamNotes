import { useEffect, useState } from 'react';
import { useDB } from './DBContext';

export interface Note {
  id: string;
  parent_id: string | null;
  author_id: string;
  content: string;
  sort_key: string;
  properties: string;
  view_mode: string;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  depth: number; 
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
        while(curr) {
            if (seen.has(curr)) {
                // Найден цикл! Спасаем заметку, выкидывая ее в корень ленты
                await db.exec(`UPDATE notes SET parent_id = NULL WHERE id = ?`, [node.id]);
                cyclesFixed++;
                break;
            }
            seen.add(curr);
            curr = parentMap.get(curr) || null;
        }
    }
    if (cyclesFixed > 0) {
       console.warn(`Внимание: разорвано ${cyclesFixed} циклических ссылок. Потерянные заметки возвращены в корень!`);
    }
}

export function useNotes(parentId: string | null = null) {
  const db = useDB();
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    let isMounted = true;
    
    const fetchNotes = async () => {
      // Каждый раз при старте проверяем, нет ли потерянных заметок из-за DnD циклов
      await rescueOrphans(db);

      const query = parentId 
        ? `WITH RECURSIVE
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
          ORDER BY root_created_at DESC, path_str ASC;`
        : `WITH RECURSIVE
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
        
      const res = await db.execO(query, parentId ? [parentId] : []);
      if (isMounted) setNotes(res as Note[]);
    };

    fetchNotes();

    const cleanup = db.onUpdate((updateType, dbName, tblName, rowid) => {
      if (tblName === 'notes') {
        fetchNotes();
      }
    });

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [db, parentId]);

  return notes;
}
