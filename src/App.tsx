import React, { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { useDB } from './db/DBContext';
import { Feed, extractTags } from './components/Feed';
import { TweetEditor } from './components/TiptapEditor';
import { useNotes, useFeeds, useFeedRole, rescueOrphans } from './db/hooks';
import { addOptimistic, removeOptimistic } from './db/optimisticNotes';
import { putDecryptCache } from './db/notesCache';
import type { Feed as FeedData } from './db/hooks';
import { useCrypto } from './crypto/CryptoContext';
import { isEncrypted } from './crypto/cipher';
import { FekMissingError } from './crypto/feedCipher';
import { decodeInviteLink, hashHasInvite } from './sharing/inviteLink';
import { SyncEvents } from './sync/events';
import type { SyncEngine } from './sync/syncEngine';
import type { RelayClient } from './sync/relayClient';
import { APP_VERSION } from './data/changelog';

// Heavy / rarely-shown UI — kept out of the initial bundle.
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const WhatsNewModal = lazy(() => import('./components/WhatsNewModal'));
const Lightbox = lazy(() => import('./editor/components/Lightbox').then(m => ({ default: m.Lightbox })));
import { THEMES, type ThemeId } from './themes';
import { FeedsSidebar, parseLucideAvatar } from './layout/FeedsSidebar';
import { RightSidebar } from './layout/RightSidebar';
import { DashboardPanel } from './layout/DashboardPanel';
import { usePomodoro } from './hooks/usePomodoro';
import { revokeAllUrls } from './utils/opfsFiles';
import { ToastContainer, showToast } from './components/Toast';
import { saveBackup, listBackups, loadBackup, deleteBackup, shouldShowBackupReminder, type BackupEntry } from './utils/autoBackup';
import './index.css';

// ─── Helpers ──────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).substring(2, 9);

// Re-renders on breakpoint change so orientation/resize doesn't leave the
// mobile tab UI desynced.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)').matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 640px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}



// ─── App ──────────────────────────────────────────────────────────────
function App() {
  const db = useDB();
  const crypto = useCrypto();
  const { encrypt, decrypt, encryptForFeed, decryptForFeed, nostrPubKey, deriveNewFeedKey, encryptFeedKey, nickname, setNickname } = crypto;
  const useCryptoRef = useRef(crypto);
  useCryptoRef.current = crypto;
  const [showSettings, setShowSettings] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [backupList, setBackupList] = useState<BackupEntry[]>([]);
  const [lightboxEntry, setLightboxEntry] = useState<{ url: string; name: string } | null>(null);

  const isMobile = useIsMobile();
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;

  // ── Mobile tab navigation ─────────────────────────────────────────
  const [mobileTab, setMobileTab] = useState<'dashboard' | 'feed' | 'calendar'>('feed');
  const mobileTabRef = useRef<'dashboard' | 'feed' | 'calendar'>('feed');
  mobileTabRef.current = mobileTab;
  const [mobileFeedsOpen, setMobileFeedsOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const handlingPopState = useRef(false);

  // Push a history entry so Android's back gesture pops through tab history
  // instead of navigating the browser backward (→ blank page).
  const navigateTab = useCallback((tab: 'dashboard' | 'feed' | 'calendar') => {
    setMobileTab(tab);
    setMobileFeedsOpen(false);
    setMobileSearchOpen(false);
    if (isMobileRef.current && !handlingPopState.current) {
      try { history.pushState({ mobileTab: tab }, ''); } catch {}
    }
  }, []);

  // Seed initial history state + listen for back gesture
  useEffect(() => {
    if (!isMobileRef.current) return;
    // Seed two entries so the first real back gesture doesn't fall out of the app.
    // replaceState replaces the current entry; then we push one buffer entry on top
    // so Android can fire one gratuitous popstate before reaching our app-managed state.
    try {
      history.replaceState({ mobileTab: 'feed', sheafy: true }, '');
      history.pushState({ mobileTab: 'feed', sheafy: true }, '');
    } catch {}

    const onPop = (e: PopStateEvent) => {
      if (!isMobileRef.current) return;
      handlingPopState.current = true;
      // Fullscreen editor: back gesture closes it, stays on current tab
      if (fullscreenDraftRef.current) {
        setFullscreenDraft(null);
        handlingPopState.current = false;
        return;
      }
      const tab = e.state?.mobileTab as 'dashboard' | 'feed' | 'calendar' | undefined;
      setMobileFeedsOpen(false);
      setMobileSearchOpen(false);
      if (tab && ['dashboard', 'feed', 'calendar'].includes(tab)) {
        setMobileTab(tab);
      } else {
        // Fell past app history — re-anchor so next back gesture is also caught
        setMobileTab('feed');
        try { history.pushState({ mobileTab: 'feed', sheafy: true }, ''); } catch {}
      }
      handlingPopState.current = false;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── One-time graph integrity check ────────────────────────────────
  const rescueDone = useRef(false);
  useEffect(() => {
    if (rescueDone.current) return;
    rescueDone.current = true;
    rescueOrphans(db);
  }, [db]);

  // ── Auto-backup ───────────────────────────────────────────────────
  const autoBackupDone = useRef(false);
  useEffect(() => {
    if (autoBackupDone.current) return;
    autoBackupDone.current = true;
    listBackups().then(setBackupList);
    if (shouldShowBackupReminder()) {
      showToast('Нет бэкапа более 3 дней — создайте его в Настройках.', 'info');
    }
    const interval = setInterval(() => {
      runAutoBackup();
    }, 6 * 60 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  // ── Internal backlink navigation (scrollToNote — basic) ────────────
  useEffect(() => {
    (window as any).scrollToNote = (id: string) => {
      setFocusedTweetId(id);
    };
    return () => { delete (window as any).scrollToNote; };
  }, []);

  // ── Global lightbox (image zoom) ───────────────────────────────────
  useEffect(() => {
    (window as any).openLightbox = (url: string, name: string) => setLightboxEntry({ url, name });
    (window as any).onHashtagClick = (tag: string) => {
      setSearchQuery(tag);
      if (window.innerWidth <= 640) setMobileSearchOpen(true);
    };
    return () => { 
      delete (window as any).openLightbox;
      delete (window as any).onHashtagClick;
    };
  }, []);

  // ── E2E Migration: encrypt existing unencrypted data ──────────────
  const migrationDone = useRef(false);
  useEffect(() => {
    if (migrationDone.current) return;
    if (localStorage.getItem('sn_migration_done') === '1') { migrationDone.current = true; return; }
    migrationDone.current = true;
    (async () => {
      await db.exec(`BEGIN`);
      try {
        const notes = await db.execO(`SELECT id, content, properties FROM notes`) as any[];
        for (const n of notes) {
          if (n.content && !isEncrypted(n.content)) {
            await db.exec(`UPDATE notes SET content = ?, properties = ? WHERE id = ?`,
              [encrypt(n.content), encrypt(n.properties || '{}'), n.id]);
          }
        }
        const feedRows = await db.execO(`SELECT id, name, avatar FROM feeds`) as any[];
        for (const f of feedRows) {
          if (f.name && !isEncrypted(f.name)) {
            await db.exec(`UPDATE feeds SET name = ?, avatar = ? WHERE id = ?`,
              [encrypt(f.name), f.avatar ? encrypt(f.avatar) : null, f.id]);
          }
        }
        await db.exec(`COMMIT`);
        localStorage.setItem('sn_migration_done', '1');
      } catch (err) {
        await db.exec(`ROLLBACK`);
        console.error('[migration] E2E encryption migration failed, will retry on next load:', err);
      }
    })();
  }, [db, encrypt]);

  // ── Color migration: replace old default blue with neutral gray ────
  const colorMigrationDone = useRef(false);
  useEffect(() => {
    if (colorMigrationDone.current) return;
    if (localStorage.getItem('sn_color_migration_v1') === '1') { colorMigrationDone.current = true; return; }
    colorMigrationDone.current = true;
    (async () => {
      // Replace old neon defaults with neutral tones
      const oldBlues = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16'];
      const neutral = ['#787774', '#606a7b', '#969591', '#37352f', '#868e96', '#b1b1ae', '#a3a6ad', '#c9cbd0'];
      const feeds = await db.execO(`SELECT id, color FROM feeds`) as any[];
      for (const f of feeds) {
        const idx = oldBlues.indexOf(f.color);
        if (idx !== -1) {
          await db.exec(`UPDATE feeds SET color = ? WHERE id = ?`, [neutral[idx], f.id]);
        }
      }
      localStorage.setItem('sn_color_migration_v1', '1');
    })();
  }, [db]);

  // ── Feeds ──────────────────────────────────────────────────────────
  const feeds = useFeeds();
  const [activeFeedId, setActiveFeedId] = useState<string | null>(null);

  // Auto-create default feed and set active on first load
  useEffect(() => {
    if (feeds.length > 0 && !activeFeedId) {
      setActiveFeedId(feeds[0].id);
    }
  }, [feeds, activeFeedId]);

  // ── Dev stress test ─────────────────────────────────────────────────
  useEffect(() => {
    let _stressAbort = false;
    (window as any).__stressAbort = () => { _stressAbort = true; console.log('Aborting after current batch...'); };
    (window as any).__stressTest = async (n = 10000) => {
      _stressAbort = false;
      if (!db || !activeFeedId) { console.warn('db or activeFeedId not ready'); return; }
      const STATUSES = ['none', 'todo', 'doing', 'done'];
      const TAGS = ['#идея', '#мфт', '#coding', '#ницше', '#школа', '#bookmark'];
      const WORDS = ['разум', 'предсказывать', 'события', 'умнее', 'варианты', 'решения', 'поток', 'идея', 'задача', 'мысль', 'план', 'фокус', 'цель', 'день', 'время'];
      const rand = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
      const randText = () => Array.from({ length: 6 + Math.floor(Math.random() * 10) }, () => rand(WORDS)).join(' ');

      const syncEngine = (window as any).__syncEngine;
      syncEngine?.stop();
      console.log('Sync paused.');
      console.time('stressTest');
      const BATCH = 200;
      let inserted = 0;
      const parentIds: string[] = [];

      for (let b = 0; b < Math.ceil(n / BATCH); b++) {
        const batchSize = Math.min(BATCH, n - b * BATCH);
        await db.exec('BEGIN');
        for (let i = 0; i < batchSize; i++) {
          const id = globalThis.crypto.randomUUID();
          const isChild = parentIds.length > 50 && Math.random() < 0.2;
          const parentId = isChild ? parentIds[Math.floor(Math.random() * Math.min(parentIds.length, 200))] : null;
          const status = rand(STATUSES);
          const tag = Math.random() < 0.4 ? rand(TAGS) : '';
          const text = randText() + (tag ? ' ' + tag : '');
          const content = encrypt(JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }));
          const props = encrypt(JSON.stringify({ status }));
          const sortKey = String(Date.now() + inserted + i).padStart(20, '0');
          await db.exec(
            `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, feed_id) VALUES (?,?,?,?,?,?,?)`,
            [id, parentId, nostrPubKey || 'local-user', content, sortKey, props, activeFeedId]
          );
          if (!isChild) parentIds.push(id);
        }
        await db.exec('COMMIT');
        inserted += batchSize;
        console.log(`inserted ${inserted}/${n}`);
        if (_stressAbort) { console.log(`Aborted at ${inserted}.`); syncEngine?.start(); return; }
      }
      console.timeEnd('stressTest');
      syncEngine?.start();
      console.log('Done. Sync resumed. Scroll to see notes.');
    };
    (window as any).__stressClean = async () => {
      if (!db || !activeFeedId) return;
      const syncEngine = (window as any).__syncEngine;
      syncEngine?.stop();
      await db.exec(`DELETE FROM notes WHERE feed_id = ?`, [activeFeedId]);
      syncEngine?.start();
      console.log('Cleaned. Sync resumed.');
    };
    return () => {
      delete (window as any).__stressTest;
      delete (window as any).__stressClean;
    };
  }, [db, activeFeedId, encrypt, nostrPubKey]);

  // ── Re-register FEKs for all feeds whenever feeds list changes ────
  // Use a Set to track which feed IDs have been registered so that:
  // a) We don't skip re-registration after the first load (fixes new-device race
  //    where sync pushes encryption_key after the initial feeds fetch), and
  // b) We don't redundantly re-decrypt keys for already-registered feeds.
  const fekRegisteredIds = useRef(new Set<string>());
  useEffect(() => {
    if (feeds.length === 0) return;
    const { registerFeedKey, decryptFeedKey: dfk } = useCryptoRef.current;
    for (const feed of feeds) {
      if (feed.encryption_key && !fekRegisteredIds.current.has(feed.id)) {
        try {
          const fekHex = dfk(feed.encryption_key);
          registerFeedKey(feed.id, fekHex);
          fekRegisteredIds.current.add(feed.id);
        } catch { /* ignore malformed keys */ }
      }
    }
  }, [feeds]);

  // ── navigateToNote: find or create note, switch feed, focus ────────
  useEffect(() => {
    (window as any).navigateToNote = async (noteId: string) => {
      const existing = await db.execO(`SELECT id, feed_id, is_deleted FROM notes WHERE id = ?`, [noteId]) as any[];
      if (existing.length > 0) {
        if (existing[0].is_deleted) {
          showToast('Эта заметка была удалена.', 'info');
          return;
        }
        if (existing[0].feed_id && existing[0].feed_id !== activeFeedId) {
          setActiveFeedId(existing[0].feed_id);
        }
        setFocusedTweetId(noteId);
        if (window.innerWidth <= 640) navigateTab('feed');
      } else {
        // Note doesn't exist — create it in the active feed
        const now = Date.now();
        const content = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Новая заметка' }] }] });
        const enc = activeFeedId ? (s: string) => encryptForFeed(s, activeFeedId) : encrypt;
        await db.exec(
          `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, feed_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
          [noteId, null, nostrPubKey, enc(content), now.toString(), enc('{"type":"sheaf","status":"none","date":""}'), activeFeedId, now, now]
        );
        setFocusedTweetId(noteId);
      }
    };
    return () => { delete (window as any).navigateToNote; };
  }, [db, encrypt, activeFeedId]);

  // ── Nostr-relay sync ───────────────────────────────────────────────
  // Deferred: nostr-tools (~150 kB gzip) is not needed for first paint.
  // Wait for idle so the initial render isn't blocked downloading + parsing it.
  const syncStarted = useRef(false);
  useEffect(() => {
    if (syncStarted.current) return;
    syncStarted.current = true;
    let engine: SyncEngine | null = null;
    let relay: RelayClient | null = null;
    let cancelled = false;

    const boot = async () => {
      try {
        const [{ SyncEngine, seedDefaultRelays }, { RelayClient }] = await Promise.all([
          import('./sync/syncEngine'),
          import('./sync/relayClient'),
        ]);
        if (cancelled) return;
        await seedDefaultRelays(db);
        relay = new RelayClient();
        engine = new SyncEngine({
          db,
          crypto: {
            encrypt: useCryptoRef.current.encrypt,
            decrypt: useCryptoRef.current.decrypt,
            encryptForFeed: useCryptoRef.current.encryptForFeed,
            decryptForFeed: useCryptoRef.current.decryptForFeed,
            nostrPubKey: useCryptoRef.current.nostrPubKey,
            nostrPrivKey: useCryptoRef.current.nostrPrivKey,
          },
          relayClient: relay,
        });
        await engine.start();
        if (cancelled) { engine.stop(); relay.destroy(); return; }
        (window as any).__syncEngine = engine;
      } catch (err) {
        console.error('[sync] failed to start', err);
      }
    };

    const ric: any = (window as any).requestIdleCallback;
    const handle = ric
      ? ric(boot, { timeout: 2000 })
      : setTimeout(boot, 200);

    return () => {
      cancelled = true;
      const cic: any = (window as any).cancelIdleCallback;
      if (ric && cic) cic(handle); else clearTimeout(handle);
      try { engine?.stop(); } catch { /* ignore */ }
      try { relay?.destroy(); } catch { /* ignore */ }
      delete (window as any).__syncEngine;
    };
  }, [db]);

  // ── Visibility cleanup: free memory when backgrounded (prevents Safari tab kill) ──
  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') {
        revokeAllUrls();
        try { (window as any).__syncEngine?.stop(); } catch { /* ignore */ }
      } else {
        try { (window as any).__syncEngine?.start(); } catch { /* ignore */ }
      }
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, []);

  // ── iOS virtual keyboard: publish visual-viewport height as --vvh ──
  // Zen editor & modals use `height: var(--vvh, 100dvh)` so the keyboard
  // doesn't overlap the input area.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
      document.documentElement.style.setProperty('--vv-offset', `${vv.offsetTop}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // Auto-create default feed on very first load (wait for sync to try first)
  const defaultFeedCreated = useRef(false);
  useEffect(() => {
    if (defaultFeedCreated.current) return;
    defaultFeedCreated.current = true;
    (async () => {
      // Give sync engine 4 seconds to populate DB if this is a first run on new device
      await new Promise(r => setTimeout(r, 4000));
      const existing = await db.execO(`SELECT id FROM feeds LIMIT 1`);
      if ((existing as any[]).length === 0) {
        const id = 'feed-default';
        const now = Date.now();
        const fekHex = deriveNewFeedKey(0);
        const encryptedFek = encryptFeedKey(fekHex);
        await db.exec(
          `INSERT OR IGNORE INTO feeds (id, name, color, encryption_key, key_index, is_shared, created_at) VALUES (?,?,?,?,?,?,?)`,
          [id, encrypt('Sheaflow'), '#787774', encryptedFek, 0, 0, now]
        );
        setActiveFeedId(id);
      }
    })();
  }, [db, encrypt]);

  const handleCreateFeed = useCallback(async (name: string, color: string, avatar: string | null) => {
    const id = 'feed-' + uid();
    // Get next key_index by counting existing feeds
    const countRes = await db.execA(`SELECT COALESCE(MAX(key_index), -1) + 1 FROM feeds`);
    const keyIndex = (countRes[0]?.[0] as number) ?? 0;
    const fekHex = deriveNewFeedKey(keyIndex);
    const encryptedFek = encryptFeedKey(fekHex);
    await db.exec(
      `INSERT INTO feeds (id, name, color, avatar, encryption_key, key_index, is_shared, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      [id, encrypt(name), color, avatar ? encrypt(avatar) : null, encryptedFek, keyIndex, 0, Date.now()]
    );
    setActiveFeedId(id);
  }, [db, encrypt, deriveNewFeedKey, encryptFeedKey]);

  const handleUpdateFeed = useCallback(async (id: string, name: string, color: string, avatar: string | null) => {
    // avatar holds either a data-URL (photo), "lucide:Name" (icon), or null (initials)
    // All non-null values are encrypted with the master key
    await db.exec(
      `UPDATE feeds SET name = ?, color = ?, avatar = ? WHERE id = ?`,
      [encrypt(name), color, avatar ? encrypt(avatar) : null, id]
    );
  }, [db, encrypt]);

  const handleImportSharedFeed = useCallback(async (payload: { flow_id: string; fek: string; name: string; relay?: string; role?: string; author_npub?: string; notes?: any[]; links?: any[] }) => {
    const { flow_id, fek, name, role = 'participant', author_npub } = payload;
    // Check if feed already exists
    const existing = await db.execO(`SELECT id FROM feeds WHERE id = ?`, [flow_id]) as any[];
    if (existing.length > 0) {
      showToast('Эта лента уже есть в библиотеке.', 'info');
      return;
    }
    const encryptedFek = encryptFeedKey(fek);
    // Register the FEK immediately so encrypt/decrypt work
    useCryptoRef.current.registerFeedKey(flow_id, fek);
    const now = Date.now();

    if (existing.length === 0) {
      // Fresh import: create the feed row
      await db.exec(
        `INSERT INTO feeds (id, name, color, encryption_key, key_index, is_shared, created_at) VALUES (?,?,?,?,?,?,?)`,
        [flow_id, encrypt(name || 'Shared Flow'), '#6095ed', encryptedFek, null, 1, now]
      );
      // Record our own role in this shared feed
      await db.exec(
        `INSERT OR REPLACE INTO feed_members (feed_id, pubkey, role, added_at) VALUES (?,?,?,?)`,
        [flow_id, nostrPubKey, role, now]
      );
      // Record the author as admin (if provided)
      if (author_npub && author_npub !== nostrPubKey) {
        await db.exec(
          `INSERT OR IGNORE INTO feed_members (feed_id, pubkey, role, added_at) VALUES (?,?,?,?)`,
          [flow_id, author_npub, 'admin', now]
        );
      }
    }
    // Feed already existed — still fall through to insert snapshot notes below

    // Import notes snapshot if included in payload — this ensures notes appear immediately
    // without relying on relay sync (which may be slow or unavailable).
    // Works whether this is a fresh import or a re-import of an existing feed.
    let notesInserted = 0;
    if (payload.notes?.length) {
      for (const n of payload.notes) {
        try {
          await db.exec(
            `INSERT OR IGNORE INTO notes (id, parent_id, author_id, content, sort_key, properties, feed_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
            [n.id, n.parent_id ?? null, n.author_id ?? null, n.content, n.sort_key, n.properties, n.feed_id, n.created_at, n.updated_at]
          );
          notesInserted++;
        } catch { /* ignore individual row errors */ }
      }
    }
    if (payload.links?.length) {
      for (const l of payload.links) {
        try {
          await db.exec(
            `INSERT OR IGNORE INTO links (source_id, target_id, feed_id) VALUES (?,?,?)`,
            [l.source_id, l.target_id, l.feed_id]
          );
        } catch { /* ignore individual row errors */ }
      }
    }

    if (existing.length > 0) {
      // Feed already existed — show a message indicating how many notes were synced
      showToast(`Лента уже есть. Синхронизировано заметок: ${notesInserted}.`, 'info');
    }

    setActiveFeedId(flow_id);

    // Tell SyncEngine to subscribe to the new shared feed immediately (for future updates)
    if ((window as any).__syncEngine) {
      await (window as any).__syncEngine.refreshRelays();
      // Retry after 3s in case relay connection wasn't ready on first subscribe
      setTimeout(async () => {
        try { await (window as any).__syncEngine?.refreshRelays(); } catch { /* ignore */ }
      }, 3000);
    }
  }, [db, encrypt, encryptFeedKey, nostrPubKey]);

  // ── Auto-import invite from URL fragment (/invite#i=<b64>) ────────
  // Runs once on mount after db/crypto are ready. If the user opened an invite
  // link, decode the payload, confirm, and import. The fragment is cleared
  // afterwards so refreshes don't re-prompt.
  const inviteHandled = useRef(false);
  useEffect(() => {
    if (inviteHandled.current) return;
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hashHasInvite(hash)) return;
    inviteHandled.current = true;
    const payload = decodeInviteLink(window.location.href);
    if (!payload) return;
    const ok = window.confirm(`Импортировать шифлоу "${payload.name}"?`);
    try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch {}
    if (ok) handleImportSharedFeed(payload);
  }, [handleImportSharedFeed]);

  const handleDeleteFeed = useCallback(async (id: string, isShared: boolean) => {
    if (!isShared) {
      // Author deleting their feed: soft-delete notes first so the deletion
      // syncs over Nostr. We MUST wait for flushNow() before hard delete,
      // otherwise the soft-delete changeset can be erased from crsql_changes
      // by the physical DELETE before the engine reads it, leaving "ghost"
      // notes on other devices forever.
      await db.exec(`UPDATE notes SET is_deleted = 1 WHERE feed_id = ?`, [id]);
      const engine = (window as any).__syncEngine;
      if (engine) {
        try {
          await engine.flushNow();
        } catch (err) {
          console.error('[delete-feed] flushNow failed, aborting hard delete to preserve sync state', err);
          showToast('Не удалось отправить удаление на relay. Попробуйте при стабильном соединении.', 'error');
          return;
        }
      }
      await db.exec(`DELETE FROM feeds WHERE id = ?`, [id]);
      await db.exec(`DELETE FROM notes WHERE feed_id = ?`, [id]);
    } else {
      // Reader leaving shared feed: Hard delete immediately.
      // SyncEngine won't push hard deletes to the shared channel (can't map __crsql_del to feed_id).
      await db.exec(`DELETE FROM feeds WHERE id = ?`, [id]);
      await db.exec(`DELETE FROM notes WHERE feed_id = ?`, [id]);
      if ((window as any).__syncEngine) {
        setTimeout(() => (window as any).__syncEngine.refreshRelays(), 100);
      }
    }

    if (activeFeedId === id) {
      setActiveFeedId(feeds.find(f => f.id !== id)?.id ?? null);
    }
  }, [db, activeFeedId, feeds]);

  const handleShareFeed = useCallback(async (id: string): Promise<{ notes: any[]; links: any[] } | null> => {
    await db.exec(`UPDATE feeds SET is_shared = 1 WHERE id = ?`, [id]);
    // Push all existing notes to the feed channel (FEK-encrypted) so remote readers can decrypt them
    const doSync = async () => {
      const engine = (window as any).__syncEngine;
      if (!engine) return;
      await engine.refreshRelays();
      await engine.resyncFeed(id);
    };
    // Try immediately, then retry after 3s in case relay wasn't connected yet
    doSync().catch(e => console.warn('[sync] initial resync failed:', e));
    setTimeout(() => doSync().catch(e => console.warn('[sync] retry resync failed:', e)), 3000);

    // Collect snapshot of all notes in the feed — embedded in the share payload so
    // the recipient gets them immediately without waiting for relay sync
    const notes = await db.execO(
      `SELECT id, parent_id, author_id, content, sort_key, properties, feed_id, created_at, updated_at
       FROM notes WHERE feed_id = ? AND (is_deleted IS NULL OR is_deleted = 0)`,
      [id]
    );
    const links = await db.execO(
      `SELECT source_id, target_id, feed_id FROM links WHERE feed_id = ?`,
      [id]
    );
    console.log('[share] snapshot:', (notes as any[]).length, 'notes,', (links as any[]).length, 'links');
    return { notes: notes as any[], links: links as any[] };
  }, [db]);

  const handleArchiveFeed = useCallback(async (id: string, archived: boolean) => {
    await db.exec(`UPDATE feeds SET is_archived = ? WHERE id = ?`, [archived ? 1 : 0, id]);
    if (archived && activeFeedId === id) {
      setActiveFeedId(feeds.find(f => f.id !== id && !f.is_archived)?.id ?? null);
    }
  }, [db, activeFeedId, feeds]);

  // ── Nickname DB sync (cross-device via CRDT user_settings) ────────────
  const handleSetNickname = useCallback(async (name: string) => {
    setNickname(name);
    try {
      const enc = encrypt(name);
      await db.exec(`INSERT OR REPLACE INTO user_settings (key, value) VALUES ('nickname', ?)`, [enc]);
    } catch (err) {
      console.error('[settings] failed to persist nickname to DB', err);
    }
  }, [setNickname, encrypt, db]);

  useEffect(() => {
    const syncNickname = async () => {
      try {
        const rows = await db.execO(`SELECT value FROM user_settings WHERE key = 'nickname'`) as any[];
        if (rows.length > 0 && rows[0].value) {
          const dbNickname = decrypt(rows[0].value);
          if (dbNickname && dbNickname !== useCryptoRef.current.nickname) {
            setNickname(dbNickname);
          }
        }
      } catch { /* ignore decrypt errors */ }
    };
    syncNickname(); // load on startup
    const cleanupUpdate = db.onUpdate((_: any, __: any, tblName: string) => {
      if (tblName === 'user_settings') syncNickname();
    });
    const syncListener = () => syncNickname();
    SyncEvents.addEventListener('sync', syncListener);
    return () => { cleanupUpdate(); SyncEvents.removeEventListener('sync', syncListener); };
  }, [db, decrypt]); // setNickname intentionally omitted to avoid loop

  // ── Theme ──────────────────────────────────────────────────────────
  // Force light theme for the new minimalist design (reset old localStorage)
  const DESIGN_VERSION = 'minimalist-v1';
  const validThemeIds = new Set(THEMES.map(t => t.id));
  const [theme, setTheme] = useState<ThemeId>(() => {
    if (localStorage.getItem('design_version') !== DESIGN_VERSION) {
      localStorage.setItem('design_version', DESIGN_VERSION);
      localStorage.setItem('theme', 'light');
      localStorage.setItem('sn_font', 'Courier Prime'); // Reset default font
      return 'light';
    }
    const saved = localStorage.getItem('theme');
    return (saved && validThemeIds.has(saved as ThemeId) ? saved : 'light') as ThemeId;
  });

  const [font, setFont] = useState<string>(() => {
    return localStorage.getItem('sn_font') || 'Courier Prime';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? '' : theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const handleSetTheme = (newTheme: ThemeId) => {
    setTheme(newTheme);
    const meta = THEMES.find(t => t.id === newTheme);
    if (meta) setFont(meta.defaultFont);
  };

  // Auto-show "What's New" when APP_VERSION changes
  useEffect(() => {
    const seen = localStorage.getItem('sn_whats_new_seen');
    if (seen !== APP_VERSION) {
      setShowWhatsNew(true);
    }
  }, []);

  const handleCloseWhatsNew = () => {
    localStorage.setItem('sn_whats_new_seen', APP_VERSION);
    setShowWhatsNew(false);
  };

  const FONT_FAMILIES: Record<string, string> = {
    'Courier Prime': "'Courier Prime', 'Courier New', monospace",
    'Source Code Pro': "'Source Code Pro', 'Courier New', monospace",
    'Inter (Base)': "'Inter', system-ui, -apple-system, sans-serif",
    'Bitter (Serif)': "'Bitter', Georgia, serif",
    'System Stack': "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  };

  useEffect(() => {
    const family = FONT_FAMILIES[font] || FONT_FAMILIES['Courier Prime'];
    document.documentElement.style.setProperty('--font-body', family);
    localStorage.setItem('sn_font', font);
  }, [font]);

  // ── Note state ─────────────────────────────────────────────────────
  const [focusedTweetId, setFocusedTweetId] = useState<string | null>(null);
  const [replyingToTweetId, setReplyingToTweetId] = useState<string | null>(null);
  const [editingTweet, setEditingTweet] = useState<any>(null);
  const [fullscreenDraft, setFullscreenDraft] = useState<{ ast: string; propsJson: string; onSubmit: (ast: string, pj: string) => void } | null>(null);
  const fullscreenDraftRef = useRef(fullscreenDraft);
  fullscreenDraftRef.current = fullscreenDraft;

  const openFullscreenDraft = useCallback((draft: { ast: string; propsJson: string; onSubmit: (ast: string, pj: string) => void }) => {
    setFullscreenDraft(draft);
    if (window.innerWidth <= 640) {
      try { history.pushState({ mobileTab: mobileTabRef.current, fullscreenDraft: true, sheafy: true }, ''); } catch {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const closeFullscreenDraft = useCallback(() => {
    setFullscreenDraft(null);
  }, []);

  const handleExpandEditor = (ast: string, propsJson: string, onSubmit: (ast: string, pj: string) => void) => {
    openFullscreenDraft({ ast, propsJson, onSubmit });
  };

  // ── Sidebar filters ────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState<string | null>(null);

  // ── Pomodoro ───────────────────────────────────────────────────────
  const [pomodoroState, pomodoroActions] = usePomodoro();

  const allNotes = useNotes(null, activeFeedId);

  const allTags = React.useMemo(() => {
    const s = new Set<string>();
    allNotes.forEach(n => extractTags(n.content).forEach(t => s.add(t)));
    return [...s].sort();
  }, [allNotes]);

  const activeDays = React.useMemo(() => {
    const s = new Set<string>();
    allNotes.forEach(n => s.add(new Date(n.created_at).toISOString().slice(0, 10)));
    return s;
  }, [allNotes]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  };

  // ── CRUD ───────────────────────────────────────────────────────────
  // Feed-aware encrypt helper — uses FEK when available
  const feedEncrypt = useCallback((text: string) => {
    if (activeFeedId) return encryptForFeed(text, activeFeedId);
    return encrypt(text);
  }, [activeFeedId, encryptForFeed, encrypt]);

  const handleFekError = (err: unknown): boolean => {
    if (err instanceof FekMissingError) {
      showToast(`Ключ шифрования для ленты не загружен — сохранение невозможно. Перезагрузите приложение или проверьте invite.`, 'error');
      return true;
    }
    return false;
  };

  const insertRootNote = async (astText: string, propsJson: string) => {
    if (!activeFeedId) return;
    const id = 'note-' + uid();
    const now = Date.now();
    // Optimistic: card appears in the same React tick the user submitted.
    // Pre-seed the decrypt cache so the next real fetch is a sync hit.
    putDecryptCache(id, now, astText, propsJson);
    addOptimistic({
      id, parent_id: focusedTweetId, author_id: nostrPubKey,
      content: astText, sort_key: now.toString(), properties: propsJson,
      view_mode: '', feed_id: activeFeedId,
      created_at: now, updated_at: now,
      is_deleted: 0, is_pinned: 0, depth: focusedTweetId ? 1 : 0,
    });
    try {
      await db.exec(
        `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, feed_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        [id, focusedTweetId, nostrPubKey, feedEncrypt(astText), now.toString(), feedEncrypt(propsJson), activeFeedId, now, now]
      );
    } catch (err) {
      removeOptimistic(id);
      if (handleFekError(err)) throw err;
      throw err;
    }
  };

  const handleInlineReply = async (parentId: string, astText: string, propsJson: string) => {
    if (!activeFeedId) return;
    const id = 'note-' + uid();
    const now = Date.now();
    putDecryptCache(id, now, astText, propsJson);
    addOptimistic({
      id, parent_id: parentId, author_id: nostrPubKey,
      content: astText, sort_key: now.toString(), properties: propsJson,
      view_mode: '', feed_id: activeFeedId,
      created_at: now, updated_at: now,
      is_deleted: 0, is_pinned: 0, depth: 1,
    });
    try {
      await db.exec(
        `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, feed_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        [id, parentId, nostrPubKey, feedEncrypt(astText), now.toString(), feedEncrypt(propsJson), activeFeedId, now, now]
      );
      setReplyingToTweetId(null);
    } catch (err) {
      removeOptimistic(id);
      if (handleFekError(err)) return;
      throw err;
    }
  };

  const handleEditSubmit = async (noteId: string, astText: string, propsJson: string) => {
    // Lookup the feed_id and existing properties of this note
    const rows = await db.execO(`SELECT feed_id, properties FROM notes WHERE id = ?`, [noteId]) as any[];
    const noteFeedId = rows[0]?.feed_id || activeFeedId;
    const dec = noteFeedId ? (s: string) => decryptForFeed(s, noteFeedId) : decrypt;
    const enc = noteFeedId ? (s: string) => encryptForFeed(s, noteFeedId) : encrypt;

    // Merge incoming props over existing ones so fields the editor doesn't
    // track (completed_at, etc.) are never silently dropped.
    let existingProps: Record<string, unknown> = {};
    try { existingProps = JSON.parse(dec(rows[0]?.properties) || '{}'); } catch { /* */ }
    const merged = JSON.stringify({ ...existingProps, ...JSON.parse(propsJson) });

    try {
      await db.exec(
        `UPDATE notes SET content = ?, properties = ?, updated_at = ? WHERE id = ?`,
        [enc(astText), enc(merged), Date.now(), noteId]
      );
      setEditingTweet(null);
    } catch (err) {
      if (handleFekError(err)) return;
      throw err;
    }
  };

  // ── Export / Import ────────────────────────────────────────────────
  const handleExport = async () => {
    if (!confirm('Экспорт создаст файл с расшифрованными данными. Любой, кто получит этот файл, сможет прочитать ваши заметки. Продолжить?')) return;
    const rows = await db.execO(`SELECT * FROM notes WHERE is_deleted = 0`) as any[];
    const decryptedRows = rows.map(r => {
      const dec = r.feed_id ? (s: string) => decryptForFeed(s, r.feed_id) : decrypt;
      return {
        ...r,
        content: dec(r.content),
        properties: dec(r.properties),
      };
    });
    const feedRows = await db.execO(`SELECT * FROM feeds`) as any[];
    const decryptedFeeds = feedRows.map(f => ({
      ...f,
      name: decrypt(f.name),
      avatar: f.avatar ? decrypt(f.avatar) : null,
      encryption_key: null, // Don't export raw encrypted FEKs
    }));
    const payload = JSON.stringify({ version: 1, notes: decryptedRows, feeds: decryptedFeeds }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sheafy-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFeedMD = async (feedId: string, feedName: string) => {
    const { formatNotesAsMarkdown } = await import('./utils/markdownExport');
    const rows = await db.execO(`SELECT id, parent_id, content, sort_key, created_at, properties, author_id, feed_id FROM notes WHERE feed_id = ? AND is_deleted = 0`, [feedId]) as any[];
    const decryptedRows = rows.map(r => ({
      ...r,
      content: decryptForFeed(r.content, r.feed_id),
      properties: r.properties ? decryptForFeed(r.properties, r.feed_id) : null,
    }));
    
    // Sort slightly different than UI maybe, but formatNotesAsMarkdown handles the tree building
    const markdown = formatNotesAsMarkdown(decryptedRows);
    
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${feedName.replace(/[^a-z0-9а-яё]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllMD = async () => {
    const JSZip = (await import('jszip')).default;
    const { formatNotesAsMarkdown } = await import('./utils/markdownExport');
    
    const zip = new JSZip();
    
    // Get all non-deleted feeds
    const feedRows = await db.execO(`SELECT id, name FROM feeds`) as any[];
    const usedNames = new Set<string>();

    for (const f of feedRows) {
      const feedName = decrypt(f.name) || 'Unnamed';
      let safeName = feedName.replace(/[^a-z0-9а-яё \-_]/gi, '_').trim() || f.id;
      
      // Ensure unique filename
      let originalSafeName = safeName;
      let counter = 1;
      while (usedNames.has(safeName.toLowerCase())) {
        safeName = `${originalSafeName}_${counter}`;
        counter++;
      }
      usedNames.add(safeName.toLowerCase());
      
      const rows = await db.execO(`SELECT id, parent_id, content, sort_key, created_at, properties, author_id FROM notes WHERE feed_id = ? AND is_deleted = 0`, [f.id]) as any[];
      if (rows.length === 0) continue;

      const decryptedRows = rows.map(r => ({
        ...r,
        content: f.id ? decryptForFeed(r.content, f.id) : decrypt(r.content), // Fallback
        properties: r.properties ? (f.id ? decryptForFeed(r.properties, f.id) : decrypt(r.properties)) : null,
      }));

      const markdown = formatNotesAsMarkdown(decryptedRows);
      zip.file(`${safeName}.md`, markdown);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sheafy-markdown-export-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      // Support both old format (array) and new format ({ version, notes, feeds })
      const notes: any[] = Array.isArray(data) ? data : (data.notes || []);
      const importFeeds: any[] = Array.isArray(data) ? [] : (data.feeds || []);
      for (const f of importFeeds) {
        // Generate a new FEK for each imported feed
        const countRes = await db.execA(`SELECT COALESCE(MAX(key_index), -1) + 1 FROM feeds`);
        const keyIndex = (countRes[0]?.[0] as number) ?? 0;
        const fekHex = deriveNewFeedKey(keyIndex);
        const encryptedFek = encryptFeedKey(fekHex);
        await db.exec(
          `INSERT OR IGNORE INTO feeds (id, name, color, avatar, encryption_key, key_index, is_shared, created_at) VALUES (?,?,?,?,?,?,?,?)`,
          [f.id, encrypt(f.name), f.color, f.avatar ? encrypt(f.avatar) : null, encryptedFek, keyIndex, f.is_shared || 0, f.created_at]
        );
      }
      for (const n of notes) {
        const noteFeedId = n.feed_id || activeFeedId;
        const enc = noteFeedId ? (s: string) => encryptForFeed(s, noteFeedId) : encrypt;
        await db.exec(
          `INSERT OR IGNORE INTO notes (id, parent_id, author_id, content, sort_key, properties, view_mode, feed_id, created_at, updated_at, is_deleted) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [n.id, n.parent_id, n.author_id || nostrPubKey, enc(n.content), n.sort_key, enc(n.properties || '{}'), n.view_mode || 'list', noteFeedId, n.created_at, n.updated_at, n.is_deleted || 0]
        );
      }
      showToast(`Импортировано ${notes.length} заметок`, 'success');
    } catch (err) { showToast('Ошибка импорта: ' + String(err), 'error'); }
    e.target.value = '';
  };

  const buildBackupPayload = useCallback(async () => {
    const rows = await db.execO(`SELECT * FROM notes WHERE is_deleted = 0`) as any[];
    const decryptedRows = rows.map(r => {
      const dec = r.feed_id ? (s: string) => decryptForFeed(s, r.feed_id) : decrypt;
      return { ...r, content: dec(r.content), properties: dec(r.properties) };
    });
    const feedRows = await db.execO(`SELECT * FROM feeds`) as any[];
    const decryptedFeeds = feedRows.map(f => ({
      ...f,
      name: decrypt(f.name),
      avatar: f.avatar ? decrypt(f.avatar) : null,
      encryption_key: null,
    }));
    return { version: 1, notes: decryptedRows, feeds: decryptedFeeds };
  }, [db, decrypt, decryptForFeed]);

  const runAutoBackup = useCallback(async () => {
    try {
      const payload = await buildBackupPayload();
      await saveBackup(payload);
      const updated = await listBackups();
      setBackupList(updated);
    } catch (err) {
      console.error('[backup] auto-backup failed', err);
    }
  }, [buildBackupPayload]);

  const handleCreateBackup = useCallback(async () => {
    try {
      const payload = await buildBackupPayload();
      await saveBackup(payload);
      const updated = await listBackups();
      setBackupList(updated);
      showToast('Бэкап создан', 'success');
    } catch (err) {
      showToast('Ошибка создания бэкапа: ' + String(err), 'error');
    }
  }, [buildBackupPayload]);

  const handleRestoreBackup = useCallback(async (name: string) => {
    if (!confirm(`Восстановить данные из бэкапа ${name}?\n\nЭто импортирует все заметки и ленты из бэкапа. Существующие данные не удаляются.`)) return;
    try {
      const data = await loadBackup(name) as any;
      const notes: any[] = data.notes || [];
      const importFeeds: any[] = data.feeds || [];
      for (const f of importFeeds) {
        const countRes = await db.execA(`SELECT COALESCE(MAX(key_index), -1) + 1 FROM feeds`);
        const keyIndex = (countRes[0]?.[0] as number) ?? 0;
        const fekHex = deriveNewFeedKey(keyIndex);
        const encryptedFek = encryptFeedKey(fekHex);
        await db.exec(
          `INSERT OR IGNORE INTO feeds (id, name, color, avatar, encryption_key, key_index, is_shared, created_at) VALUES (?,?,?,?,?,?,?,?)`,
          [f.id, encrypt(f.name), f.color, f.avatar ? encrypt(f.avatar) : null, encryptedFek, keyIndex, f.is_shared || 0, f.created_at]
        );
      }
      for (const n of notes) {
        const noteFeedId = n.feed_id || activeFeedId;
        const enc = noteFeedId ? (s: string) => encryptForFeed(s, noteFeedId) : encrypt;
        await db.exec(
          `INSERT OR IGNORE INTO notes (id, parent_id, author_id, content, sort_key, properties, view_mode, feed_id, created_at, updated_at, is_deleted) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [n.id, n.parent_id, n.author_id || nostrPubKey, enc(n.content), n.sort_key, enc(n.properties || '{}'), n.view_mode || 'list', noteFeedId, n.created_at, n.updated_at, n.is_deleted || 0]
        );
      }
      showToast(`Восстановлено ${notes.length} заметок из бэкапа`, 'success');
    } catch (err) {
      showToast('Ошибка восстановления: ' + String(err), 'error');
    }
  }, [db, encrypt, encryptForFeed, deriveNewFeedKey, encryptFeedKey, activeFeedId, nostrPubKey]);

  const handleDeleteBackup = useCallback(async (name: string) => {
    try {
      await deleteBackup(name);
      setBackupList(prev => prev.filter(b => b.name !== name));
    } catch (err) {
      showToast('Ошибка удаления бэкапа: ' + String(err), 'error');
    }
  }, []);

  const activeFeed = feeds.find(f => f.id === activeFeedId);
  const myFeedRole = useFeedRole(activeFeedId, nostrPubKey);

  const iconBtn: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--line)',
    color: 'var(--text-sub)',
    padding: '3px 10px',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    fontSize: '0.78rem',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-body)',
    fontWeight: 500,
    transition: 'background 0.12s, color 0.12s',
  };

  return (
    <div
      className="app-root"
      style={{ display: 'flex', background: 'var(--bg-page)' }}
      data-mobile-tab={mobileTab}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        if (!isMobileRef.current) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        const target = e.target as Element;
        if (target.closest?.('.note-card-swipeable')) return;
        // Skip edge swipes (< 20px from edge) — let Android system back gesture handle those
        if (touchStartX.current < 20 || touchStartX.current > window.innerWidth - 20) return;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          // Fullscreen editor open: right→left swipe closes it
          if (fullscreenDraftRef.current) {
            if (dx < 0) closeFullscreenDraft();
            return;
          }
          const tabs = ['dashboard', 'feed', 'calendar'] as const;
          const idx = tabs.indexOf(mobileTabRef.current);
          // right→left (dx < 0) = "back" = lower index (Dashboard direction)
          // left→right (dx > 0) = "forward" = higher index (Calendar direction)
          if (dx < 0 && idx > 0) navigateTab(tabs[idx - 1]);
          else if (dx > 0 && idx < tabs.length - 1) navigateTab(tabs[idx + 1]);
        }
      }}
    >
      {/* ── Feeds sidebar ── */}
      <FeedsSidebar
        feeds={feeds}
        activeFeedId={activeFeedId}
        onSelect={id => { setActiveFeedId(id); setFocusedTweetId(null); setReplyingToTweetId(null); if (isMobileRef.current) navigateTab('feed'); }}
        onCreateFeed={handleCreateFeed}
        onUpdateFeed={handleUpdateFeed}
        onDeleteFeed={handleDeleteFeed}
        onImportSharedFeed={handleImportSharedFeed}
        onShareFeed={handleShareFeed}
        onArchiveFeed={handleArchiveFeed}
        onExportFeedMD={handleExportFeedMD}
      />

      {/* ── Dashboard panel ── */}
      <DashboardPanel
        activeStatusFilter={dashboardStatusFilter}
        onStatusFilter={setDashboardStatusFilter}
        activeFeedId={activeFeedId}
        pomodoro={pomodoroState}
        pomodoroActions={pomodoroActions}
      />

      {/* ── Main content ── */}
      <div className="main-content" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '0.75rem 1.5rem', boxSizing: 'border-box', alignItems: 'center', background: 'transparent', overflowY: 'auto' }}>
        {/* Header */}
        <header className="app-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem', flexShrink: 0, width: '100%', borderBottom: '1px solid var(--line)', paddingBottom: '12px' }}>
          {/* Mobile: back button to feeds list */}
          <button
            className="mobile-feeds-btn"
            onClick={() => setMobileFeedsOpen(true)}
            style={{ display: 'none', background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: '4px 6px 4px 0', fontSize: '0.8rem', alignItems: 'center', gap: '4px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            Ленты
          </button>
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)', flexShrink: 0, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center' }}>
            {(() => {
              const avatar = activeFeed?.avatar ?? null;
              if (!avatar) return null;
              const LIcon = parseLucideAvatar(avatar);
              if (LIcon) return <LIcon size={16} style={{ marginRight: '6px', flexShrink: 0, color: 'var(--text)' }} />;
              return <img src={avatar} onError={(e) => (e.currentTarget.style.display = 'none')} style={{ width: '1.2rem', height: '1.2rem', objectFit: 'cover', borderRadius: '50%', marginRight: '6px', flexShrink: 0 }} />;
            })()}
            {activeFeed?.name || 'Sheafy'}
          </h1>
          <span style={{ color: 'var(--text-faint)', fontSize: '0.8rem', flexShrink: 0 }}>
            {focusedTweetId ? '/ ветка' : ''}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Mobile search icon */}
            <button
              className="mobile-search-btn"
              onClick={() => setMobileSearchOpen(v => !v)}
              aria-label="Поиск"
              style={{ background: 'none', border: 'none', color: mobileSearchOpen ? 'var(--text)' : 'var(--text-faint)', cursor: 'pointer', padding: '4px', display: 'none', alignItems: 'center' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
            {nostrPubKey && (
              <span
                className="header-npub"
                onClick={() => setShowSettings(true)}
                style={{ fontSize: '0.7rem', color: 'var(--text-faint)', cursor: 'pointer', fontFamily: 'var(--font-mono)', padding: '2px 6px', border: '1px solid var(--line)', borderRadius: 'var(--radius)' }}
              >
                {nostrPubKey.slice(0, 6)}…{nostrPubKey.slice(-4)}
              </span>
            )}
            <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} style={{ ...iconBtn, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              {theme === 'dark' ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
              )}
              <span className="header-theme-label">{theme === 'dark' ? 'Светлая' : 'Тёмная'}</span>
            </button>
            <button onClick={() => setShowSettings(true)} style={iconBtn}>⚙</button>
            {focusedTweetId && (
              <button onClick={() => { setFocusedTweetId(null); setReplyingToTweetId(null); }} style={{ ...iconBtn, borderColor: 'var(--accent)', color: 'var(--accent)' }}>← Назад</button>
            )}
          </div>
        </header>
        <Suspense fallback={null}>
          {showSettings && (
            <SettingsModal
              onClose={() => setShowSettings(false)}
              onExport={handleExport}
              onImport={handleImport}
              font={font}
              setFont={setFont}
              fontOptions={Object.keys(FONT_FAMILIES)}
              theme={theme}
              setTheme={handleSetTheme}
              onSetNickname={handleSetNickname}
              onExportMD={handleExportAllMD}
              backups={backupList}
              onCreateBackup={handleCreateBackup}
              onRestoreBackup={handleRestoreBackup}
              onDeleteBackup={handleDeleteBackup}
              onWhatsNew={() => { setShowSettings(false); setShowWhatsNew(true); }}
            />
          )}
          {showWhatsNew && <WhatsNewModal onClose={handleCloseWhatsNew} />}
        </Suspense>

        {/* Mobile search bar */}
        {mobileSearchOpen && (
          <div className="mobile-search-bar">
            <div style={{ position: 'relative' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                className="search-bar"
                placeholder="Поиск..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
                data-lpignore="true"
                style={{ paddingLeft: '30px', paddingRight: '30px', width: '100%', boxSizing: 'border-box' }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
            {allTags.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {allTags.map(tag => (
                    <span
                      key={tag}
                      className={`tag-pill${selectedTags.has(tag) ? ' active' : ''}`}
                      onClick={() => toggleTag(tag)}
                    >{tag}</span>
                  ))}
                  {selectedTags.size > 0 && (
                    <button
                      onClick={() => setSelectedTags(new Set())}
                      style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-faint)', borderRadius: 'var(--radius)', padding: '2px 8px', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                    >✕ Сбросить</button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Editor + Feed */}
        <div className="feed-area" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '760px' }}>
          <div className="mobile-editor-hide">
            {myFeedRole !== 'reader' && (
              <div style={{ flexShrink: 0 }}>
                <TweetEditor
                  placeholder={focusedTweetId ? 'Оставить ответ в ветке...' : 'Что происходит?'}
                  buttonText="Шифнуть"
                  onSubmit={insertRootNote}
                  autoFocus
                  onExpand={(ast, pj) => {
                    openFullscreenDraft({ ast, propsJson: pj, onSubmit: insertRootNote });
                  }}
                />
              </div>
            )}
            {myFeedRole === 'reader' && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-faint)', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius)', background: 'var(--bg-hover)', textAlign: 'center' }}>
                Только чтение — вы добавлены как читатель этой ленты
              </div>
            )}
          </div>
          <Feed
            parentId={focusedTweetId}
            feedId={activeFeedId}
            isSharedFeed={!!activeFeed?.is_shared}
            localNpub={nostrPubKey}
            myRole={myFeedRole}
            onNoteClick={(id) => { setFocusedTweetId(id); setReplyingToTweetId(null); }}
            replyingToId={replyingToTweetId}
            editingNote={editingTweet}
            onStartReply={(id) => {
              if (isMobile) {
                openFullscreenDraft({ ast: '', propsJson: '{}', onSubmit: (ast, pj) => handleInlineReply(id, ast, pj) });
              } else {
                setReplyingToTweetId(id);
              }
            }}
            onCancelReply={() => setReplyingToTweetId(null)}
            onSubmitReply={handleInlineReply}
            onStartEdit={(note) => {
              if (isMobile) {
                openFullscreenDraft({ ast: note.content, propsJson: note.properties, onSubmit: (ast, pj) => handleEditSubmit(note.id, ast, pj) });
              } else {
                setEditingTweet(note);
              }
            }}
            onCancelEdit={() => setEditingTweet(null)}
            onSubmitEdit={handleEditSubmit}
            searchQuery={searchQuery}
            selectedTags={selectedTags}
            selectedDate={selectedDate}
            statusFilter={dashboardStatusFilter}
            onStartPomodoro={(taskId, taskTitle) => pomodoroActions.start(taskId, taskTitle)}
          />
        </div>
      </div>

      {/* Right sidebar — sibling of main-content so it can be independently shown on mobile */}
      <RightSidebar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        activeDays={activeDays}
        allTags={allTags}
        selectedTags={selectedTags}
        toggleTag={toggleTag}
        clearTags={() => setSelectedTags(new Set())}
      />

      {fullscreenDraft && (
        <TweetEditor
          placeholder="Что происходит?"
          initialAst={fullscreenDraft.ast}
          initialPropsStr={fullscreenDraft.propsJson}
          onSubmit={(ast, pj) => { fullscreenDraft.onSubmit(ast, pj); closeFullscreenDraft(); }}
          onCancel={closeFullscreenDraft}
          autoFocus
          zenMode={true}
        />
      )}

      {/* ── Mobile FAB ── */}
      {myFeedRole !== 'reader' && (
        <button
          className="mobile-fab"
          onClick={() => openFullscreenDraft({ ast: '', propsJson: '{}', onSubmit: insertRootNote })}
          aria-label="Новая заметка"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      )}

      {/* ── Mobile feeds overlay ── */}
      {mobileFeedsOpen && (
        <div className="mobile-feeds-overlay">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 16px 8px', borderBottom: '1px solid var(--line)' }}>
            <button onClick={() => setMobileFeedsOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>Ленты</span>
          </div>
          <FeedsSidebar
            feeds={feeds}
            activeFeedId={activeFeedId}
            onSelect={id => { setActiveFeedId(id); setFocusedTweetId(null); setReplyingToTweetId(null); navigateTab('feed'); }}
            onCreateFeed={handleCreateFeed}
            onUpdateFeed={handleUpdateFeed}
            onDeleteFeed={handleDeleteFeed}
            onImportSharedFeed={handleImportSharedFeed}
            onShareFeed={handleShareFeed}
            onArchiveFeed={handleArchiveFeed}
            onExportFeedMD={handleExportFeedMD}
              />
        </div>
      )}

      {/* ── Mobile tab bar ── */}
      <nav className="mobile-tab-bar">
        {([
          {
            id: 'dashboard' as const, label: 'Дашборд',
            icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
          },
          {
            id: 'feed' as const, label: 'Лента',
            icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>,
          },
          {
            id: 'calendar' as const, label: 'Поиск',
            icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
          },
        ]).map(tab => (
          <button
            key={tab.id}
            className={`mobile-tab-btn${mobileTab === tab.id ? ' active' : ''}`}
            onClick={() => navigateTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {lightboxEntry && (
        <Suspense fallback={null}>
          <Lightbox url={lightboxEntry.url} name={lightboxEntry.name} onClose={() => setLightboxEntry(null)} />
        </Suspense>
      )}
      <ToastContainer />
    </div>
  );
}

export default App;
