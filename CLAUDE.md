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

### Стек и Данные

Вся база данных живёт в браузере через **CR-SQLite WASM** в OPFS. 
- **E2EE (End-to-End Encryption)**: Все пользовательские данные шифруются **AES-GCM**. Ключи извлекаются из BIP-39 сид-фразы (Nostr-совместимо). Данные передаются в SQLite уже в зашифрованном виде.
- **CryptoContext.tsx**: Управляет мастер-ключом в памяти и шифрует контент (TipTap AST) и свойства (properties) перед записью.

Таблицы в `src/db/schema.ts`:
- `notes` — зашифрованный `content` (TipTap JSON) и `properties` (JSON), `feed_id`.
- `feeds` — для разделения заметок по потокам. Названия также шифруются.
- `links` — для backlink-связей.

Все таблицы настроены как CRDT через `crsql_as_crr()`.

### Поток данных

**Чтение:** `useNotes(parentId, feedId)` в `src/db/hooks.ts` выполняет рекурсивный CTE-запрос для получения дерева с глубиной. Хук переподписывается через `db.onUpdate()`. Контент дешифруется на стороне клиента перед рендерингом. Feed виртуализирует результат через `@tanstack/react-virtual`.

**Запись:** `App.tsx` оркестрирует INSERT/UPDATE напрямую в SQLite. Контент шифуется перед записью в БД. Feed делает UPDATE для drag-and-drop (меняет `parent_id` и `sort_key`) и для обновления чекбоксов (через `onUpdateAST`).

### Ключевые компоненты

**`src/components/TiptapEditor.tsx`** содержит:
- `TweetEditor` — основной редактор на базе TipTap. Поддерживает `zenMode` (полный экран) и сохранение в зашифрованном виде.
- `renderTiptapNode` (в `src/editor/TiptapViewer.tsx`) — легковесный high-performance рендер JSON в React-элементы.

**`src/components/NoteCard.tsx`** — карточка заметки:
- Отображает контент и вложения.
- Инлайновые редактируемые пропсы (статус, дата) с автоматическим сохранением.
- Drag-and-drop зоны для иерархического перемещения.

**`src/components/NoteModal.tsx`** — Zen Mode контейнер. Перехватывает фокус для редактирования.

**`src/crypto/`** — Логика безопасности:
- `CryptoContext.tsx` — провайдер ключей.
- `cipher.ts` — функции `encrypt/decrypt` (AES-GCM).
- `bip39.ts`, `keys.ts` — генерация Nostr-ключей из фразы.

### CORS-заголовки

Vite-сервер выставляет `Cross-Origin-Opener-Policy: same-origin` и `Cross-Origin-Embedder-Policy: require-corp` — это обязательно для работы `SharedArrayBuffer` в OPFS.
