import React, { createContext, useContext, useEffect, useState } from 'react';
import initWasm, { DB } from '@vlcn.io/crsqlite-wasm';
// Важно: мы пробрасываем URL до бинарника, чтобы сборщик правильно его отдал браузеру
import wasmUrl from '@vlcn.io/crsqlite-wasm/crsqlite.wasm?url';
import { schema, migrations } from './schema';

export const DBContext = createContext<DB | null>(null);

export const useDB = () => {
    const db = useContext(DBContext);
    if (!db) throw new Error("useDB должно использоваться внутри AppDBProvider");
    return db;
};

export const AppDBProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
    const [db, setDb] = useState<DB | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        async function init() {
            try {
                // Инициализация WASM движка SqLite
                const sqlite = await initWasm(() => wasmUrl);
                
                // Подключение к БД (сохраняется в Origin Private File System)
                console.log("Открываем БД в OPFS...");
                const database = await sqlite.open('sheafy_v1.db');
                
                // Накатываем структуру таблиц
                for (const query of schema) {
                   await database.exec(query);
                }

                // Helper: add a column through CR-SQLite's alter API so triggers stay in sync.
                // crsql_alter_begin/commit update the CRDT metadata; if the table isn't CRR yet
                // those calls throw and are ignored — the column is still added correctly.
                const safeAddColumnCRR = async (table: string, col: string, type: string) => {
                  try { await database.exec(`SELECT crsql_alter_begin('${table}')`); } catch { /* not yet CRR or already in alter */ }
                  try { await database.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); } catch { /* already exists */ }
                  try { await database.exec(`SELECT crsql_alter_commit('${table}')`); } catch { /* ignore */ }
                };

                // Migrations: add missing columns (wrapped with crsql_alter so triggers update)
                const feedsInfo = await database.execO<{name: string}>('PRAGMA table_info(feeds)');
                const existingFeedsColumns = feedsInfo.map(row => row.name);

                for (const mig of migrations) {
                  const match = mig.match(/ALTER TABLE (\w+) ADD COLUMN\s+([A-Za-z0-9_]+)/i);
                  const tblName = match ? match[1].toLowerCase() : null;
                  const colName = match ? match[2] : null;

                  if (tblName === 'feeds' && colName && existingFeedsColumns.includes(colName)) {
                    continue; // already present
                  }

                  try {
                    if (tblName) { try { await database.exec(`SELECT crsql_alter_begin('${tblName}')`); } catch { } }
                    await database.exec(mig);
                    if (tblName) { try { await database.exec(`SELECT crsql_alter_commit('${tblName}')`); } catch { } }
                  } catch { /* column already exists — skip */ }
                }

                // Safety: ensure is_archived exists on older DBs (uses crsql_alter so triggers stay valid)
                await safeAddColumnCRR('feeds', 'is_archived', 'BOOLEAN DEFAULT 0');

                // Register / repair CRR for all tables.
                // Nuclear repair: drop ALL triggers on each table first, then recreate via crsql_as_crr.
                // This fixes "expected N values, got M" errors caused by ALTER TABLE without crsql wrappers.
                for (const table of ['feeds', 'notes', 'links', 'user_settings', 'feed_members']) {
                  try {
                    // Drop every trigger on this table (they're all crsql-managed)
                    const triggers = await database.execO<{name: string}>(
                      `SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name=?`,
                      [table]
                    );
                    for (const t of triggers) {
                      try { await database.exec(`DROP TRIGGER IF EXISTS "${t.name}"`); } catch { }
                    }
                    // Recreate CRR triggers for current schema
                    await database.exec(`SELECT crsql_as_crr('${table}')`);
                  } catch (e) { console.warn(`[db] CRR rebuild ${table}:`, e); }
                }
                
                if (isMounted) {
                   setDb(database);
                   console.log("БД успешно инициализирована! 🚀");
                }
            } catch (err: any) {
                if (isMounted) setError(err.message);
                console.error("Критическая ошибка инициализации БД:", err);
            }
        }
        init();
        return () => { isMounted = false; };
    }, []);

    if (error) return <div style={{ color: "red", padding: "2rem" }}>❌ Ошибка БД: {error}</div>;
    if (!db) return <div style={{ padding: "2rem", color: "#f8fafc", textAlign: "center" }}>⏳ Загрузка OPFS базы данных и WebAssembly...</div>;

    return <DBContext.Provider value={db}>{children}</DBContext.Provider>;
};
