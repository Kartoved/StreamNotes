# CLAUDE.md

Sheafy / StreamNotes — local-first notes app. React + TipTap, CR-SQLite WASM in OPFS, Nostr relay sync. E2EE with BIP-39-derived keys. **Read `THREAT_MODEL.md` for the security contract.**

## Commands

```bash
npm run dev     # localhost:5173
npm run build   # tsc + vite build
npm run test    # vitest run
npm run lint    # eslint
```

## Encryption invariants (do not break)

- All user data is encrypted before SQLite write — plaintext never hits disk.
- **Master key** — derived from BIP-39 seed. Encrypts personal-feed content, feed names, FEK storage.
- **FEK** (Feed Encryption Key) — per shared-feed 32-byte key. Stored in `feeds.encryption_key` encrypted-with-master. Used for shared-feed content.
- `useNotes` returns **already-decrypted** content/properties (via `getOrDecrypt` in `notesCache.ts`). Don't `decrypt()` again — it's a no-op via prefix check but wasteful and misleading.
- Encrypt before `db.exec()` writes: `encrypt(text)` or `encryptForFeed(text, feedId)`.
- `cipher.ts` uses xchacha20poly1305 with random 24-byte nonce per encrypt. Never reuse nonces.
- Invite payload (`handleImportSharedFeed`) validates FEK format + decrypts snapshot sample before accepting. Existing-feed re-imports NEVER overwrite FEK.

## Architecture

- **DB:** CR-SQLite WASM in OPFS. Tables: `notes`, `feeds`, `links`, `feed_members`. CRR-enabled for CRDT sync.
- **Editor:** `src/components/TiptapEditor.tsx` — single-file. Backlink `[[` + hashtag `#` use TipTap Suggestion plugins → React dropdowns. Each Suggestion plugin needs a unique `PluginKey`.
- **Viewer:** `src/editor/TiptapViewer.tsx` — read-only TipTap JSON renderer, no editor init.
- **Feed:** `src/components/Feed.tsx` — virtualized via `@tanstack/react-virtual`. Renders `NoteCard`s.
- **Sync:** `src/sync/` — Nostr relay client + sync engine. State at `window.__syncEngine`.

## Window globals (intentional)

Components deep in the virtualizer can't reliably get props/context. Registered in `App.tsx` / `Feed.tsx`:

| Global | Set by | Used by |
|---|---|---|
| `window.scrollToNote(id)` | App.tsx | TiptapViewer (internal links) |
| `window.navigateToNote(id)` | App.tsx | TiptapViewer (can switch feeds) |
| `window.openLightbox(url, name)` | App.tsx | AttachmentDisplay |
| `window.__feedAllTags` | Feed.tsx | HashtagDropdown |
| `window.__syncEngine` | App.tsx | visibility handler, refresh triggers |

**Never store overlay/dropdown state INSIDE virtualizer children** — virtualizer recycles components on scroll, resetting local state. Use window globals + app-level state.

## UI quirks

- **Lightbox** (`src/editor/components/Lightbox.tsx`) does NOT use `createPortal` — renders directly in app-root to avoid conflict with `overflow: hidden` on body.
- **Mobile nav** — three tabs `dashboard | feed | calendar` via `data-mobile-tab`. Swipe left/right switches. Feed-list overlay (z-index 200) lives at app level.
- **Theme** — `localStorage('theme')` → `<html data-theme="dark">`. Inline script in `index.html` applies pre-React (no flash).
- **Font size** — CSS var `--font-size-base` from `localStorage('sn_font_size')`. Headings use `em`, not `rem`, to scale with body text.
- **CORS** — Vite sets `COOP: same-origin` + `COEP: require-corp` (required for `SharedArrayBuffer` in OPFS).

## Hidden-by-default features

- **File attachment button** — hidden via `display: none` at `TiptapEditor.tsx:190`. Full upload pipeline intact. Unhide when file sync ships.
- **Author badge in NoteCard** — not rendered (collab mode pending). `AuthorBadge` function still exported, tests skipped.

## Testing

Vitest 4 with `globals: true`. Two environments:
- `node` — crypto, DB, sharing unit tests
- `happy-dom` — UI component tests (jsdom breaks on Node 24 due to top-level await in `@asamuzakjp/css-color`)

UI test files MUST start with `// @vitest-environment happy-dom`.

Setup `src/__tests__/ui/setup.ts` mocks: IntersectionObserver, ResizeObserver, OPFS, `window.*` navigation helpers, matchMedia.

Standard UI test mocks:
- `TweetEditor` → `<div data-testid="tweet-editor">`
- `TiptapRender` → `<div data-testid="tiptap-render">{ast}</div>`
- `useDB` / `useCrypto` / `useNotes` → vi.mock identity stubs
- `@tanstack/react-virtual` → sync mock returning all items
