# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Dev server (localhost:5173)
npm run build     # tsc + vite build
npm run lint      # ESLint
npm run preview   # Preview production build
npx vitest        # Run all tests
npx vitest run src/tests/LexicalRender.test.tsx  # Run single test file
```

## Architecture

**StreamNotes** — local-first приложение для заметок в формате ленты (как Twitter/Reddit threads), с богатым текстовым редактором, иерархической структурой и drag-and-drop.

### Стек данных

Вся база данных живёт в браузере через **CR-SQLite WASM** в Origin Private File System (OPFS). Данные реактивны: `db.onUpdate()` триггерит перезапрос при изменениях.

Две таблицы в `src/db/schema.ts`:
- `notes` — контент в виде **JSON AST Lexical** (не HTML), `parent_id` для дерева, `sort_key` для порядка, `properties` (JSON) для статуса/типа/даты
- `links` — для backlink-связей

Обе таблицы настроены как CRDT через `crsql_as_crr()`.

### Поток данных

**Чтение:** `useNotes(parentId)` в `src/db/hooks.ts` выполняет рекурсивный CTE-запрос для получения дерева с глубиной. Хук переподписывается через `db.onUpdate()`. Feed виртуализирует результат через `@tanstack/react-virtual`.

**Запись:** `App.tsx` оркестрирует INSERT/UPDATE напрямую в SQLite — создание заметок, ответы, редактирование. Feed делает UPDATE для drag-and-drop (меняет `parent_id` и `sort_key`) и для обновления чекбоксов (`onUpdateAST`).

### Ключевые компоненты

**`src/components/LexicalEditor.tsx`** содержит два компонента:
- `TweetEditor` — редактируемый редактор с тулбаром, markdown shortcuts, backlink typeahead (`[[` → `note://ID` ссылка)
- `LexicalRender` — read-only рендер AST в React-элементы с интерактивными чекбоксами (3 состояния: unchecked → done → cancelled)

**`src/components/Feed.tsx`** — виртуализированная лента с:
- Визуальными коннекторами вложенности (indent + вертикальные линии)
- Drag-and-drop: зоны top/center/bottom определяют sibling/child перемещение
- `rescueOrphans()` в `src/db/hooks.ts` защищает от циклов при DnD
- Секцией backlinks: ищет заметки содержащие `note://noteId` в контенте

### Контент заметок

Lexical сериализует редактор в JSON AST. Хранится в `notes.content` как строка. `LexicalRender` парсит AST и рендерит его без инициализации полного Lexical-редактора (быстро). При клике на чекбокс — инплейс-мутация AST и вызов `onUpdateAST` → UPDATE в БД.

### CORS-заголовки

Vite-сервер выставляет `Cross-Origin-Opener-Policy: same-origin` и `Cross-Origin-Embedder-Policy: require-corp` — это обязательно для работы `SharedArrayBuffer` в OPFS.
