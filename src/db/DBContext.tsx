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

                // Ремонт: чиним триггеры после прошлых сбоев ALTER (решает проблему "expected 19 values got 17")
                for (const table of ['feeds', 'notes', 'links']) {
                  try {
                    await database.exec(`SELECT crsql_alter_begin('${table}')`);
                    await database.exec(`SELECT crsql_alter_commit('${table}')`);
                    console.log(`Ремонт ${table} завершен успешно`);
                  } catch (e) {
                    console.error(`Ошибка при ремонте ${table}:`, e);
                  }
                }

                // Проверяем существующие колонки
                const feedsInfo = await database.execO<{name: string}>('PRAGMA table_info(feeds)');
                const existingFeedsColumns = feedsInfo.map(row => row.name);

                // Запускаем миграции максимально безопасно
                for (const mig of migrations) {
                  const match = mig.match(/ALTER TABLE (\w+) ADD COLUMN\s+([A-Za-z0-9_]+)/i);
                  const tblName = match ? match[1].toLowerCase() : null;
                  const colName = match ? match[2] : null;

                  if (tblName === 'feeds' && colName && existingFeedsColumns.includes(colName)) {
                    continue; // Пропускаем, если колонка уже есть
                  }
                  
                  try {
                    if (tblName) { try { await database.exec(`SELECT crsql_alter_begin('${tblName}')`); } catch(e) {} }
                    await database.exec(mig);
                    if (tblName) { try { await database.exec(`SELECT crsql_alter_commit('${tblName}')`); } catch(e) {} }
                  } catch (e) {
                    // Если упало (например, колонка уже есть), просто идем дальше
                  }
                }
                
                // Финальная регистрация CRR
                for (const table of ['feeds', 'notes', 'links']) {
                  try { 
                    await database.exec(`SELECT crsql_as_crr('${table}')`); 
                  } catch (e) { /* ignore already CRR */ }
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
