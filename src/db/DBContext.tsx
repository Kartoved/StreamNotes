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
                // Это дает практически нативную скорость диска
                console.log("Открываем БД в OPFS...");
                const database = await sqlite.open('sheafy_v1.db');
                
                // Накатываем структуру таблиц (для MVP прямо при загрузке)
                for (const query of schema) {
                   await database.exec(query);
                }

                // Run migrations (ALTERs are safe to re-run — they fail silently if column exists)
                for (const mig of migrations) {
                  try { await database.exec(mig); } catch { /* column already exists */ }
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

    // Показываем загрузочный экран пока скачивается wasm и парсится БД
    if (error) return <div style={{ color: "red", padding: "2rem" }}>❌ Ошибка БД: {error}</div>;
    if (!db) return <div style={{ padding: "2rem", color: "#f8fafc", textAlign: "center" }}>⏳ Загрузка OPFS базы данных и WebAssembly...</div>;

    return <DBContext.Provider value={db}>{children}</DBContext.Provider>;
};
