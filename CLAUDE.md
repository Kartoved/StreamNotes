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

### Стек и данные

Вся база данных живёт в браузере через **CR-SQLite WASM** в Origin Private File System (OPFS).

- **E2EE**: Все пользовательские данные шифруются перед записью в SQLite. Ключи извлекаются из BIP-39 сид-фразы (Nostr-совместимо). `CryptoContext.tsx` управляет ключами в памяти.
- **CRDT**: Все таблицы настроены через `crsql_as_crr()` — готово к p2p-синхронизации через Nostr relay (следующий крупный фичер).

Таблицы в `src/db/schema.ts`:
- `notes` — зашифрованный `content` (TipTap JSON) и `properties` (JSON), `parent_id` для дерева, `sort_key` для порядка (Fractional Indexing), `feed_id`.
- `feeds` — потоки/разделы. Названия шифруются.
- `links` — backlink-связи между заметками.

### Поток данных

**Чтение:** `useNotes(parentId, feedId)` в `src/db/hooks.ts` — рекурсивный CTE-запрос, строит дерево с глубиной. Переподписывается через `db.onUpdate()`. Контент дешифруется перед рендерингом. Feed виртуализирует результат через `@tanstack/react-virtual`.

**Запись:** `App.tsx` оркестрирует INSERT/UPDATE напрямую в SQLite. Контент шифруется перед записью. Feed делает UPDATE для drag-and-drop (меняет `parent_id` и `sort_key`) и для обновления чекбоксов (через `onUpdateAST`).

**Целостность графа:** `rescueOrphans(db)` из `src/db/hooks.ts` запускается один раз при старте приложения (в `App.tsx`) — разрывает циклические ссылки в дереве заметок. Не вызывается при каждом фетче.

### Ключевые компоненты

**`src/components/TiptapEditor.tsx`** — весь редактор в одном файле:
- `TweetEditor` — основной редактор на базе TipTap с тулбаром, поддержкой `zenMode` (полный экран), голосовым вводом через Whisper, drag-and-drop файлов.
- Расширения: `Underline`, `Link` (подключены явно, не через StarterKit), `ThreeStateTaskItem`, `AttachmentExtension`.
- Backlink typeahead: `[[` → дропдаун поиска по заметкам → вставляет `note://ID` ссылку. Дропдаун рендерится через `createPortal` в `document.body` (иначе перекрывается виртуализатором). Позиция захватывается через `ed.view.coordsAtPos()` в `onUpdate`.
- Внутренние ссылки хранят только название заметки (без `[[` `]]`), href = `note://ID`.

**`src/editor/TiptapViewer.tsx`** — read-only рендер TipTap JSON в React без инициализации редактора:
- `renderTiptapNode` — рекурсивный рендер узлов.
- Внутренние ссылки (`note://`) при клике вызывают `window.scrollToNote(id)`, который установлен в `App.tsx` и делает `setFocusedTweetId`.

**`src/components/Feed.tsx`** — виртуализированная лента:
- Drag-and-drop: зоны sibling/child определяют вложенность.
- Поиск, фильтрация по тегам и дате.
- Инлайновое редактирование: карточка в режиме редактирования не draggable.

**`src/components/NoteCard.tsx`** — карточка заметки с inline-редактором, пропсами (статус, дата) и DnD-зонами.

**`src/components/NoteModal.tsx`** — Zen Mode редактор для раскрытой заметки (fullscreen TweetEditor).

**`src/hooks/useVoiceRecorder.ts`** — захват аудио с микрофона, ресемплинг в 16kHz Float32Array для Whisper.

**`src/workers/whisper.worker.ts`** — Whisper транскрибация в Web Worker через `@xenova/transformers`. Модель: `whisper-small` (баланс качество/размер для русского языка). Кэшируется в браузере после первой загрузки.

**`src/crypto/`** — безопасность:
- `CryptoContext.tsx` — провайдер ключей, экраны авторизации (SeedSetup, UnlockScreen, SeedRecover).
- `cipher.ts` — `encrypt/decrypt`.
- `bip39.ts`, `keys.ts` — генерация Nostr-совместимых ключей из сид-фразы.

### Тема

Тема (light/dark) хранится в `localStorage('theme')`. Применяется через `data-theme="dark"` на `<html>`. Инлайн-скрипт в `index.html` читает localStorage и применяет тему до рендера React — нет мигания, работает и на экранах авторизации.

### CORS-заголовки

Vite выставляет `Cross-Origin-Opener-Policy: same-origin` и `Cross-Origin-Embedder-Policy: require-corp` — обязательно для `SharedArrayBuffer` в OPFS.
