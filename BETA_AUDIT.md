# Beta Release Audit — Findings

## 1. Security: Encryption Coverage

### App.tsx write paths — ALL OK

| Write path | Line | Encrypted? | Key |
|---|---|---|---|
| E2E migration | 72-86 | Yes, checks `isEncrypted()` first | master |
| `navigateToNote` (create note) | 140-143 | Yes, `enc()` = feedEncrypt or encrypt | feed-aware |
| Default feed creation | 201-204 | Yes, `encrypt(name)`, `encryptFeedKey(fek)` | master |
| `handleCreateFeed` | 217-221 | Yes, `encrypt(name)`, `encrypt(avatar)` | master |
| `handleUpdateFeed` | 227-230 | Yes, `encrypt(name)`, `encrypt(avatar)` | master |
| `handleImportSharedFeed` | 244-247 | Yes, `encrypt(name)`, `encryptFeedKey(fek)` | master |
| `handleDeleteFeed` | 259-269 | N/A — only `is_deleted = 1` and `DELETE` | — |
| `onShareFeed` | 514 | N/A — only `is_shared = 1` | — |
| `insertRootNote` | 376-379 | Yes, `feedEncrypt(ast)`, `feedEncrypt(props)` | feed-aware |
| `handleInlineReply` | 386-389 | Yes, `feedEncrypt(ast)`, `feedEncrypt(props)` | feed-aware |
| `handleEditSubmit` | 396-401 | Yes, looks up `feed_id`, uses `encryptForFeed` | feed-aware |
| `handleImport` | 452-457 | Yes, re-encrypts with correct per-feed key | feed-aware |
| Color migration | 96-108 | N/A — only `color` column (not secret) | — |

### Feed.tsx write paths — ALL OK

| Write path | Line | Encrypted? |
|---|---|---|
| DnD (touch + mouse) | 173, 178, 438, 442 | N/A — only `parent_id`, `sort_key` |
| `updateProperty` | 418 | Yes, `feedEncrypt(JSON.stringify(props))` |
| `deleteWithChildren` | 200-207 | N/A — soft delete `is_deleted = 1` |

### NoteCard.tsx write paths — ALL OK

| Write path | Line | Encrypted? |
|---|---|---|
| `saveProp` (status/date change) | 224-227 | Yes, `encrypt(JSON.stringify(...))` — `encrypt` prop = `feedEncrypt` from Feed |
| `onUpdateAST` (checkbox toggle) | 413 | Yes, `encrypt(newAst)` — same `feedEncrypt` prop |

### Sync engine — OK

- **Outgoing** (`syncEngine.ts:260-283`): changeset values already contain encrypted column data (encrypted at write time). Additionally wrapped with `encrypt` (personal) or `encryptForFeed` (shared) for transport.
- **Incoming** (`syncEngine.ts:304-338`): transport layer decrypted, then raw changeset applied via `crsql_changes`. Column values remain encrypted (will be decrypted at read time by `useNotes`).
- **Table whitelist** (`changeset.ts:152`): only `notes`, `feeds`, `links` accepted — `sync_relays` rejected.
- **Personal channel isolation** (`syncEngine.ts:311`): personal events only accepted from own `pubkey`.

**Verdict: No plaintext content leaks to SQLite on any write path.**

---

## 2. FEK Key Isolation

### Storage — OK
- FEK stored in `feeds.encryption_key` encrypted with master key via `encryptFeedKey()` (which is `rawEncrypt(fekHex, contentKey)`)
- At read time: `useFeeds` decrypts FEK via `decryptFeedKey()` and registers in memory via `registerFeedKey()`

### In-memory cache — OK
- `feedKeysRef` is a `useRef<Map<string, Uint8Array>>` in CryptoContext — never serialized, never stored
- Cleared on `logout()`

### Invite payload — ACCEPTABLE RISK
- Contains `fek` in plaintext hex — user responsible for secure channel
- No other secrets leak (no master key, no seed)

### :warning: FINDING: `encryptForFeed` silent fallback to master key
**File:** `CryptoContext.tsx:185-188`

```ts
encryptForFeed: (plaintext: string, feedId: string) => {
  const fek = feedKeysRef.current.get(feedId);
  if (!fek) return rawEncrypt(plaintext, keys.contentKey); // fallback to master
  return rawEncrypt(plaintext, fek);
},
```

**Risk:** If FEK is not yet registered (feeds not loaded, race condition), data in a shared feed gets encrypted with the master key. Other users who have the FEK cannot decrypt it. Not a security leak (data is still encrypted), but a **data accessibility bug for shared feeds**.

**Recommendation:** Throw an error instead of silently falling back when `feedId` is explicitly provided but FEK is missing. Or at minimum, `console.warn`.

---

## 3. localStorage Audit

### What's stored:

| Key | Content | Risk |
|---|---|---|
| `sn_seed_plain` | BIP-39 mnemonic in plaintext | :rotating_light: **HIGH** — if no password set |
| `sn_seed_encrypted` | Mnemonic encrypted with user password | OK (PBKDF2 + xchacha20) |
| `sn_has_password` | `"1"` or absent | OK |
| `sn_initialized` | `"1"` | OK |
| `sn_npub` | Nostr public key hex | OK (public) |
| `sn_nickname` | User display name | OK (user-chosen, not secret) |
| `sn_migration_done` | `"1"` | OK |
| `sn_color_migration_v1` | `"1"` | OK |
| `sn_font` | Font name | OK |
| `theme` | Theme id | OK |
| `design_version` | Version tag | OK |
| `pomodoro_YYYY-MM-DD` | Count number | OK |

### :warning: FINDING: `sn_seed_plain` stores mnemonic unencrypted

**File:** `CryptoContext.tsx:113`

When user chooses NO password during setup, the BIP-39 seed is stored in `localStorage` as plaintext. Any browser extension, XSS, or physical access can read it.

**This is by design** (convenience vs. security tradeoff), but for beta:
- **Recommendation:** At minimum, display a clear warning during setup that no-password mode stores the seed unprotected. Consider making password mandatory for beta.

### No content/note data in localStorage — confirmed OK.

---

## 4. Decrypt Error Handling

**File:** `cipher.ts:18-26`

- `decrypt()` with wrong key: `xchacha20poly1305.decrypt()` throws (`@noble/ciphers` does authenticated decryption — Poly1305 tag check fails).
- `isEncrypted()` check: if data doesn't start with `enc1:`, returned as-is (passthrough for legacy/unencrypted data).

**File:** `CryptoContext.tsx:190-198` — `decryptForFeed`:
- Tries FEK first, if throws → falls back to master key (for legacy notes)
- If master key also fails → exception propagates

**File:** `hooks.ts:135-146` — `useNotes` read path:
- Catches decrypt errors per-note, sets `content = '[Ошибка расшифровки]'`
- **Does not crash the feed** — other notes still render. OK.

**File:** `hooks.ts:195` — `useFeeds`:
- Catches FEK decrypt errors: `try { decryptFeedKey(...) } catch { /* corrupt key */ }`
- Feed still loads, will fallback to master key. OK.

**Verdict: Graceful degradation, no crashes, no silent corruption.**

---

## 5. Data Safety: `rescueOrphans`

**File:** `hooks.ts:33-66`

### Cycle detection (lines 33-54) — OK
- Walks parent chain for each note
- If cycle found: `UPDATE notes SET parent_id = NULL` — **detaches from cycle, does NOT delete**
- Self-referencing note handled (own `id` is in `seen` set from start)

### Cascade cleanup (lines 57-65) — OK
- Recursive CTE marks children of `is_deleted` notes as also deleted
- This is correct: if parent was soft-deleted, children should be too
- Does not touch non-deleted notes

**Verdict: No data loss risk from `rescueOrphans`.**

---

## 6. E2E Migration Idempotency

**File:** `App.tsx:66-88`

### Flow:
1. Check `sn_migration_done` in localStorage
2. If not done: SELECT all notes, for each non-encrypted → encrypt and UPDATE
3. Same for feeds
4. Set `sn_migration_done = '1'`

### :warning: FINDING: Migration is NOT crash-safe

**Scenario:** Tab closes after encrypting 50 of 100 notes, before `localStorage.setItem('sn_migration_done', '1')`.

On next load:
- `sn_migration_done` is not set → migration runs again
- Already-encrypted notes: `isEncrypted(n.content)` returns `true` → **skipped** (safe!)
- Remaining unencrypted notes: get encrypted normally

**Verdict:** Actually **idempotent** thanks to `isEncrypted()` check. No double-encrypt bug. But...

### :warning: FINDING: Migration is NOT in a transaction

Each note is updated individually with `await db.exec(UPDATE ...)`. If the browser crashes mid-loop, some notes are encrypted and some are not. This is fine because re-running the migration handles it (see above), but it means the database can be in a mixed state temporarily.

**Recommendation:** Wrap in a transaction for atomicity, or accept the current behavior (which is safe due to idempotency).

---

## 7. Delete Cascade & Data Integrity

### Schema — NO CASCADE
**File:** `schema.ts:14-29` — `notes` table has no `FOREIGN KEY ... ON DELETE CASCADE`. Deleting a parent does NOT auto-delete children at DB level.

### Soft delete logic
**File:** `Feed.tsx:198-207` — `deleteWithChildren`:
```sql
WITH RECURSIVE subtree AS (
  SELECT id FROM notes WHERE id = ?
  UNION ALL
  SELECT n.id FROM notes n JOIN subtree s ON n.parent_id = s.id
)
UPDATE notes SET is_deleted = 1 WHERE id IN (SELECT id FROM subtree)
```
Recursively soft-deletes entire subtree. **No orphans created.**

### Feed deletion
**File:** `App.tsx:256-278` — `handleDeleteFeed`:
- Own feed: soft-delete all notes (`is_deleted = 1`), then hard delete after 2.5s delay
- Shared feed (leaving): hard delete immediately

### :warning: FINDING: Bulk delete shares same `deleteWithChildren` — OK
**File:** `Feed.tsx` — bulk delete iterates selected notes, calls `deleteWithChildren` for each.

### `rescueOrphans` as safety net
Runs at startup. Even if orphans somehow exist, they get `parent_id = NULL` (promoted to root).

**Verdict: Delete operations are safe. No silent data loss.**

---

## 8. Export — Intentional Plaintext

**File:** `App.tsx:406-431`

`handleExport` decrypts all notes and exports as plaintext JSON. This is intentional for backup. Mitigations:
- `encryption_key` set to `null` in exported feeds — FEKs not leaked
- User consciously triggers this via settings
- No auto-export, no background export

**Recommendation:** Add a warning dialog before export: "This file will contain unencrypted data."

---

## Summary of Findings

### Must Fix (before beta)
None critical — all encryption paths are correct.

### Should Fix
1. **`encryptForFeed` silent fallback** — throw or warn when FEK missing for explicit feedId
2. **Migration not in transaction** — minor, already idempotent, but cleaner with transaction

### Should Communicate to Users
3. **`sn_seed_plain` in localStorage** — no-password mode stores seed unprotected
4. **Export is plaintext** — user should see a warning before downloading

### Verified Safe
- [x] All INSERT/UPDATE paths encrypt content and properties
- [x] DnD only touches `sort_key` / `parent_id`
- [x] FEK properly encrypted with master key in DB
- [x] FEK only in memory, cleared on logout
- [x] No note content in localStorage
- [x] Decrypt errors handled gracefully (no crash, no corruption)
- [x] `rescueOrphans` only detaches cycles, never deletes
- [x] E2E migration is idempotent (checks `isEncrypted()`)
- [x] Delete is recursive soft-delete, no orphans
- [x] Sync engine respects encryption layers and table whitelist
