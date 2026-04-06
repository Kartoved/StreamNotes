# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Dev server (localhost:5173)
npm run build          # tsc + vite build
npm run lint           # ESLint
npm run preview        # Preview production build

npm run test           # Run all tests once
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report (v8)
```

## Architecture

**Sheafy** — local-first приложение для заметок в формате ленты (как Twitter/Reddit threads), с богатым текстовым редактором, иерархической структурой и drag-and-drop. Все данные хранятся в браузере — никаких серверов, никакой регистрации.

### Стек и данные

Вся база данных живёт в браузере через **CR-SQLite WASM** в Origin Private File System (OPFS).

- **E2EE**: Все пользовательские данные шифруются перед записью в SQLite. Ключи извлекаются из BIP-39 сид-фразы (Nostr-совместимо). `CryptoContext.tsx` управляет ключами в памяти.
- **CRDT**: Все таблицы настроены через `crsql_as_crr()` — готово к p2p-синхронизации через Nostr relay (следующий крупный фичер).
- **E2E-миграция**: при старте `App.tsx` проверяет незашифрованные записи и шифрует их мастер-ключом (один раз, флаг `sn_migration_done` в localStorage).

Таблицы в `src/db/schema.ts`:
- `notes` — зашифрованный `content` (TipTap JSON) и `properties` (JSON), `parent_id` для дерева, `sort_key` для порядка (Fractional Indexing), `feed_id`, `author_id`.
- `feeds` — потоки/разделы. Название шифруется. Колонки `encryption_key` (FEK, зашифрованный мастер-ключом), `key_index`, `is_shared`.
- `links` — backlink-связи между заметками.

### Шифрование

**Мастер-ключ** (`contentKey`) — деривируется из BIP-39 seed, шифрует всё в личных лентах.

**Ключ ленты (FEK — Feed Encryption Key)** — при создании общей ленты (`is_shared = 1`) генерируется уникальный 32-байтный FEK через `deriveNewFeedKey()` / `deriveFeedKey(masterHD, keyIndex)`. FEK хранится в `feeds.encryption_key` зашифрованным мастер-ключом.

**Feed-aware encrypt/decrypt** в `Feed.tsx` и `NoteCard.tsx`:
```ts
const feedEncrypt = (text) => feedId ? encryptForFeed(text, feedId) : encrypt(text);
const feedDecrypt = (text) => feedId ? decryptForFeed(text, feedId) : decrypt(text);
```

**Шеринг (invite payload)** — единственный механизм передачи FEK другому пользователю:
```json
{ "flow_id": "<feedId>", "fek": "<hex32>", "name": "<feedName>", "author_npub": "<hex32>" }
```
Получатель импортирует payload → сохраняет FEK в `feeds.encryption_key` → может читать и писать заметки с тем же FEK. Логика в `src/__tests__/sharing/invitePayload.test.ts`.

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
- `AttachmentDisplay` — read-only рендер вложений (изображение/видео/файл), резолвит `attachment://` через OPFS.
- Внутренние ссылки (`note://`) при клике вызывают `window.navigateToNote(id)` (если установлен в `App.tsx`) или падают обратно на `window.scrollToNote(id)` (устанавливается в `Feed.tsx` и `App.tsx`). `navigateToNote` умеет переключать ленту; `scrollToNote` только скроллит текущую.

**`src/components/Feed.tsx`** — виртуализированная лента:
- Drag-and-drop: зоны sibling/child определяют вложенность.
- Поиск, фильтрация по тегам и дате (вычисляется через `extractPlainText` / `extractTags`).
- Context menu (правая кнопка мыши): ответить, редактировать, открыть, свернуть/развернуть, удалить.
- Bulk-операции: выбор нескольких заметок, удаление.
- Collapse/expand all — кнопка в тулбаре.
- Принимает `isSharedFeed` и `localNpub` — пробрасывает в `NoteCard` для отображения `AuthorBadge`.

**`src/components/NoteCard.tsx`** — карточка заметки:
- Inline-редактор (prop `editingNoteId === note.id`).
- `PropChip` (статус: none/todo/doing/done/archived) и `DateChip` — inline-редактируемые пропсы, сохраняются в SQLite при изменении.
- DnD-зоны sibling/child с визуальным индикатором.
- `AuthorBadge` — показывает аватар-кружок + npub (или «you» для локального автора) при `isSharedFeed = true`.

**`src/components/NoteModal.tsx`** — Zen Mode редактор для раскрытой заметки (fullscreen TweetEditor).

**`src/hooks/useVoiceRecorder.ts`** — захват аудио с микрофона, ресемплинг в 16kHz Float32Array для Whisper.

**`src/workers/whisper.worker.ts`** — Whisper транскрибация в Web Worker через `@xenova/transformers`. Модель: `whisper-small` (баланс качество/размер для русского языка). Кэшируется в браузере после первой загрузки.

**`src/crypto/`** — безопасность:
- `CryptoContext.tsx` — провайдер ключей, экраны авторизации (SeedSetup, UnlockScreen, SeedRecover). Экспортирует `encryptForFeed` / `decryptForFeed` / `deriveNewFeedKey` / `encryptFeedKey`.
- `cipher.ts` — `encrypt/decrypt`.
- `bip39.ts`, `keys.ts` — генерация Nostr-совместимых ключей из сид-фразы, деривация FEK.

### Тема

Тема (light/dark) хранится в `localStorage('theme')`. Применяется через `data-theme="dark"` на `<html>`. Инлайн-скрипт в `index.html` читает localStorage и применяет тему до рендера React — нет мигания, работает и на экранах авторизации.

### CORS-заголовки

Vite выставляет `Cross-Origin-Opener-Policy: same-origin` и `Cross-Origin-Embedder-Policy: require-corp` — обязательно для `SharedArrayBuffer` в OPFS.

## Тестирование

Тест-раннер — **Vitest 4** (`globals: true`). Конфиг: `vitest.config.ts`.

### Окружения

| Тип тестов | Окружение | Директория |
|---|---|---|
| Crypto / DB (unit) | `node` | `src/__tests__/crypto/`, `src/__tests__/db/`, `src/__tests__/sharing/` |
| UI (компоненты) | `happy-dom` | `src/__tests__/ui/` |

> **Важно:** на Node 24 `jsdom` несовместим (top-level await в `@asamuzakjp/css-color`). Используется `happy-dom`. Каждый UI-тест-файл начинается с `// @vitest-environment happy-dom`.

### Setup

`src/__tests__/ui/setup.ts` — подключается через `setupFiles` для всех тестов, активирует browser-стабы только при `typeof window !== 'undefined'`:
- `IntersectionObserver`, `ResizeObserver`
- `URL.createObjectURL / revokeObjectURL`
- `navigator.storage` (OPFS mock)
- `window.scrollToNote`, `window.navigateToNote`
- `window.matchMedia`

### Стратегия моков для UI-тестов

- `TweetEditor` → простой `<div data-testid="tweet-editor">` — TipTap не инициализируется.
- `TiptapRender` → `<div data-testid="tiptap-render">{astString}</div>`.
- `useDB` / `useCrypto` / `useNotes` → `vi.mock(...)` с identity-функциями.
- `@tanstack/react-virtual` → синхронный мок: `getVirtualItems()` возвращает все элементы сразу.
- `resolveUrl` (OPFS) → `vi.fn()` с контролируемым `mockResolvedValue`.

### Покрытие

```bash
npm run test:coverage   # lcov + text в терминале
```
Coverage включает: `src/crypto/**`, `src/db/schema.ts`, `src/db/hooks.ts`.
