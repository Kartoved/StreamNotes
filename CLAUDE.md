# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Dev server (localhost:5173)
npm run build     # tsc + vite build
npm run lint      # ESLint
npm run preview   # Preview production build
```

## Architecture

**StreamNotes** — local-first приложение для заметок в формате ленты (как Twitter/Reddit threads), с богатым текстовым редактором, иерархической структурой и drag-and-drop. Все данные хранятся в браузере — никаких серверов, никакой регистрации.

### Стек данных

Вся база данных живёт в браузере через **CR-SQLite WASM** в Origin Private File System (OPFS). Данные реактивны: `db.onUpdate()` триггерит перезапрос при изменениях. В БД данные хранятся в **зашифрованном виде** (E2EE) с использованием ключей, генерируемых на основе Nostr-совместимых сид-фраз.

Две таблицы в `src/db/schema.ts`:
- `notes` — контент в виде **TipTap JSON**, `parent_id` для дерева, `sort_key` для порядка (Fractional Indexing), `properties` (JSON) для статуса/типа/даты.
- `links` — для backlink-связей.
- `feeds` — для разделения заметок по разным потокам/категориям.

Все таблицы настроены как CRDT через `crsql_as_crr()`.

### Поток данных

**Чтение:** `useNotes(parentId, feedId)` в `src/db/hooks.ts` выполняет рекурсивный CTE-запрос для получения дерева с глубиной. Хук переподписывается через `db.onUpdate()`. Контент дешифруется на стороне клиента перед рендерингом. Feed виртуализирует результат через `@tanstack/react-virtual`.

**Запись:** `App.tsx` оркестрирует INSERT/UPDATE напрямую в SQLite. Контент шифуется перед записью в БД. Feed делает UPDATE для drag-and-drop (меняет `parent_id` и `sort_key`) и для обновления чекбоксов (через `onUpdateAST`).

### Ключевые компоненты

**`src/components/TiptapEditor.tsx`** содержит:
- `TweetEditor` — основной редактор на базе TipTap с тулбаром, markdown shortcuts, backlink typeahead (`[[` → `note://ID` ссылка).
- `AttachmentExtension` — поддержка вложений (картинки, видео, файлы) с сохранением в OPFS.
- `ThreeStateTaskItem` — кастомное расширение для задач с 3 состояниями (unchecked → done → cancelled).
- `renderTiptapNode` — легковесный read-only рендер JSON в React-элементы для отображения в ленте.

**`src/components/Feed.tsx`** — виртуализированная лента с:
- Визуальными коннекторами вложенности.
- Drag-and-drop: зоны перемещения определяют sibling/child вложение.
- Поиском, фильтрацией по тегам и дате.
- Секцией backlinks: ищет заметки, ссылающиеся на текущую через `note://noteId`.

### CORS-заголовки

Vite-сервер выставляет `Cross-Origin-Opener-Policy: same-origin` и `Cross-Origin-Embedder-Policy: require-corp` — это обязательно для работы `SharedArrayBuffer` в OPFS.
