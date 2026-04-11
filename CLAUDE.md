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
- `AttachmentDisplay` — read-only рендер вложений (изображение/видео/файл), резолвит `attachment://` через OPFS. Клик по изображению вызывает `window.openLightbox(url, name)` — глобальный лайтбокс, зарегистрированный в `App.tsx`.
- Внутренние ссылки (`note://`) при клике вызывают `window.navigateToNote(id)` (если установлен в `App.tsx`) или падают обратно на `window.scrollToNote(id)` (устанавливается в `Feed.tsx` и `App.tsx`). `navigateToNote` умеет переключать ленту; `scrollToNote` только скроллит текущую.

**`src/layout/DashboardPanel.tsx`** — левая панель статистики и Pomodoro:
- Кольцо прогресса задач на сегодня + статистика по статусам (todo/doing/done/неразобранные/будущие).
- Клик по строке статуса → фильтрует ленту через `onStatusFilter`.
- **Pomodoro-секция** внизу: крупное кольцо 120px, MM:SS, точки цикла (4 шт.), кнопки ▶/⏸/✕, название задачи, счётчик помидоров за сегодня.

**`src/components/Feed.tsx`** — виртуализированная лента:
- Drag-and-drop: зоны sibling/child определяют вложенность.
- Поиск, фильтрация по тегам и дате (вычисляется через `extractPlainText` / `extractTags`).
- Context menu (правая кнопка мыши): ответить, редактировать, открыть, свернуть/развернуть, перейти в ветку, **🍅 Запустить помидор** (вызывает `onStartPomodoro`), удалить.
- Bulk-операции: выбор нескольких заметок, удаление.
- Sticky toolbar сверху: collapse/expand all + группировка (Дерево/Статусы/Даты) + сортировка.
- Принимает `isSharedFeed` и `localNpub` — пробрасывает в `NoteCard` для отображения `AuthorBadge`.

**`src/components/NoteCard.tsx`** — карточка заметки:
- Inline-редактор (prop `editingNoteId === note.id`).
- `PropChip` (статус: none/todo/doing/done/archived) и `DateChip` — inline-редактируемые пропсы, сохраняются в SQLite при изменении.
- DnD-зоны sibling/child с визуальным индикатором.
- `AuthorBadge` — показывает аватар-кружок + npub (или «you» для локального автора) при `isSharedFeed = true`.

**`src/components/NoteModal.tsx`** — Zen Mode редактор для раскрытой заметки (fullscreen TweetEditor).

**`src/hooks/usePomodoro.ts`** — Pomodoro-таймер:
- Фазы: `idle → work (25 мин) → break (5 мин)`, каждые 4 помидора — `longBreak (15 мин)`.
- Счётчик выполненных за сегодня в `localStorage` (ключ `pomodoro_YYYY-MM-DD`).
- Browser Notifications при завершении фазы.
- Можно привязать к задаче (`taskId`, `taskTitle`) — передаётся из контекстного меню Feed.
- Стейт живёт в `App.tsx` через `usePomodoro()`, пробрасывается в `DashboardPanel` и `Feed`.

**`src/hooks/useVoiceRecorder.ts`** — захват аудио с микрофона, ресемплинг в 16kHz Float32Array для Whisper.

**`src/workers/whisper.worker.ts`** — Whisper транскрибация в Web Worker через `@xenova/transformers`. Модель: `whisper-small` (баланс качество/размер для русского языка). Кэшируется в браузере после первой загрузки.

**`src/crypto/`** — безопасность:
- `CryptoContext.tsx` — провайдер ключей, экраны авторизации (SeedSetup, UnlockScreen, SeedRecover). Экспортирует `encryptForFeed` / `decryptForFeed` / `deriveNewFeedKey` / `encryptFeedKey`.
- `cipher.ts` — `encrypt/decrypt`.
- `bip39.ts`, `keys.ts` — генерация Nostr-совместимых ключей из сид-фразы, деривация FEK.

### Window globals (паттерн для связи глубоко вложенных компонентов с App)

Ряд функций регистрируется в `App.tsx` через `useEffect` на `window` — это намеренный архитектурный выбор для компонентов, которые живут глубоко в дереве (особенно внутри виртуализатора) и не могут надёжно получать колбэки через пропсы или контекст:

| `window.*` | Где регистрируется | Кто вызывает |
|---|---|---|
| `scrollToNote(id)` | `App.tsx` | `TiptapViewer.tsx` (внутренние ссылки) |
| `navigateToNote(id)` | `App.tsx` | `TiptapViewer.tsx` (внутренние ссылки) |
| `openLightbox(url, name)` | `App.tsx` | `AttachmentDisplay`, `AttachmentNodeView` |

**Важно:** Не хранить стейт лайтбокса/оверлеев внутри виртуализированных компонентов — виртуализатор пересоздаёт компоненты при прокрутке, что сбрасывает локальный стейт. Лайтбокс (`src/editor/components/Lightbox.tsx`) намеренно не использует `createPortal` — он рендерится прямо в app-root без портала, чтобы избежать конфликта с `overflow: hidden` на `body`.

Все три функции мокируются в `src/__tests__/ui/setup.ts`.

### Мобильная навигация

На мобилке (≤ 640px) три вкладки в нижнем таббаре: **Дашборд / Лента / Поиск** (`data-mobile-tab` = `dashboard` | `feed` | `calendar`).

- **Дашборд** — показывает `DashboardPanel` на весь экран (статистика + Pomodoro).
- **Лента** — основной контент (`main-content`). В шапке кнопка **«← Ленты»** (`.mobile-feeds-btn`), при клике открывает `.mobile-feeds-overlay` — полноэкранный overlay со списком лент поверх всего (z-index 200). Overlay закрывается крестиком или выбором ленты.
- **Поиск** — показывает `RightSidebar` (календарь + теги).

Swipe влево/вправо переключает между вкладками. Состояние overlay (`mobileFeedsOpen`) хранится в `App.tsx` — не в виртуализированных компонентах.

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
- `window.scrollToNote`, `window.navigateToNote`, `window.openLightbox`
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
