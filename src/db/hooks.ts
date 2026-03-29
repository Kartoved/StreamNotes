import { useEffect, useState } from 'react';
import { useDB } from './DBContext';

export interface Note {
  id: string;
  parent_id: string | null;
  author_id: string;
  content: string;
  sort_key: string;
  view_mode: string;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  // Поле, вычисляемое рекурсивным алгоритмом БД: уровень вложенности
  depth: number; 
}

export function useNotes(parentId: string | null = null) {
  const db = useDB();
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    let isMounted = true;
    
    // Рекурсивный запрос CTE Common Table Expressions SQLite
    // Он за 1 проход базы плоской лентой вытащит все дерево любой глубины
    const fetchNotes = async () => {
      const query = parentId 
        ? `WITH RECURSIVE
            thread_tree AS (
              SELECT *, 0 as depth, created_at as root_created_at, sort_key as path_str 
              FROM notes 
              WHERE parent_id = ? AND is_deleted = 0
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
