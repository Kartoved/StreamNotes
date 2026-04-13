import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDB } from './db/DBContext';
import { Feed, extractTags } from './components/Feed';
import { TweetEditor } from './components/TiptapEditor';
import { useNotes, useFeeds, useFeedRole, rescueOrphans } from './db/hooks';
import type { Feed as FeedData } from './db/hooks';
import { useCrypto } from './crypto/CryptoContext';
import { isEncrypted } from './crypto/cipher';
import { SyncEngine, seedDefaultRelays, SyncEvents } from './sync/syncEngine';
import { RelayClient } from './sync/relayClient';
import SettingsModal from './components/SettingsModal';
import { Lightbox } from './editor/components/Lightbox';
import { THEMES, type ThemeId } from './themes';
import { FeedsSidebar } from './layout/FeedsSidebar';
import { RightSidebar } from './layout/RightSidebar';
import { DashboardPanel } from './layout/DashboardPanel';
import { usePomodoro } from './hooks/usePomodoro';
import './index.css';

// ─── Helpers ──────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).substring(2, 9);



// ─── App ──────────────────────────────────────────────────────────────
function App() {
  const db = useDB();
  const crypto = useCrypto();
  const { encrypt, decrypt, encryptForFeed, decryptForFeed, nostrPubKey, deriveNewFeedKey, encryptFeedKey, nickname, setNickname } = crypto;
  const useCryptoRef = useRef(crypto);
  useCryptoRef.current = crypto;
  const [showSettings, setShowSettings] = useState(false);
  const [lightboxEntry, setLightboxEntry] = useState<{ url: string; name: string } | null>(null);

  // ── Mobile tab navigation ─────────────────────────────────────────
  const [mobileTab, setMobileTab] = useState<'dashboard' | 'feed' | 'calendar'>('feed');
  const mobileTabRef = useRef<'dashboard' | 'feed' | 'calendar'>('feed');
  mobileTabRef.current = mobileTab;
  const [mobileFeedsOpen, setMobileFeedsOpen] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // ── One-time graph integrity check ────────────────────────────────
  const rescueDone = useRef(false);
  useEffect(() => {
    if (rescueDone.current) return;
    rescueDone.current = true;
    rescueOrphans(db);
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
    return () => { delete (window as any).openLightbox; };
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

  // ── navigateToNote: find or create note, switch feed, focus ────────
  useEffect(() => {
    (window as any).navigateToNote = async (noteId: string) => {
      const existing = await db.execO(`SELECT id, feed_id, is_deleted FROM notes WHERE id = ?`, [noteId]) as any[];
      if (existing.length > 0) {
        if (existing[0].is_deleted) {
          alert('Эта заметка была удалена.');
          return;
        }
        if (existing[0].feed_id && existing[0].feed_id !== activeFeedId) {
          setActiveFeedId(existing[0].feed_id);
        }
        setFocusedTweetId(noteId);
        if (window.innerWidth <= 640) setMobileTab('feed');
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
  const syncStarted = useRef(false);
  useEffect(() => {
    if (syncStarted.current) return;
    syncStarted.current = true;
    let engine: SyncEngine | null = null;
    let relay: RelayClient | null = null;
    (async () => {
      try {
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
        (window as any).__syncEngine = engine;
      } catch (err) {
        console.error('[sync] failed to start', err);
      }
    })();
    return () => {
      try { engine?.stop(); } catch { /* ignore */ }
      try { relay?.destroy(); } catch { /* ignore */ }
      delete (window as any).__syncEngine;
    };
  }, [db]);

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

  const handleImportSharedFeed = useCallback(async (payload: { flow_id: string; fek: string; name: string; relay?: string; role?: string; author_npub?: string }) => {
    const { flow_id, fek, name, role = 'participant', author_npub } = payload;
    // Check if feed already exists
    const existing = await db.execO(`SELECT id FROM feeds WHERE id = ?`, [flow_id]) as any[];
    if (existing.length > 0) {
      alert('This flow already exists in your library.');
      return;
    }
    const encryptedFek = encryptFeedKey(fek);
    // Register the FEK immediately so encrypt/decrypt work
    useCryptoRef.current.registerFeedKey(flow_id, fek);
    const now = Date.now();
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
    setActiveFeedId(flow_id);

    // Tell SyncEngine to subscribe to the new shared feed immediately
    if ((window as any).__syncEngine) {
      await (window as any).__syncEngine.refreshRelays();
      // Retry after 3s in case relay connection wasn't ready on first subscribe
      setTimeout(async () => {
        try { await (window as any).__syncEngine?.refreshRelays(); } catch { /* ignore */ }
      }, 3000);
    }
  }, [db, encrypt, encryptFeedKey, nostrPubKey]);

  const handleDeleteFeed = useCallback(async (id: string, isShared: boolean) => {
    if (!isShared) {
      // Author deleting their feed: Soft-delete notes first so the deletion syncs over Nostr
      await db.exec(`UPDATE notes SET is_deleted = 1 WHERE feed_id = ?`, [id]);
      // Give SyncEngine 2500ms to flush the soft deletes, then hard delete locally.
      setTimeout(async () => {
        await db.exec(`DELETE FROM feeds WHERE id = ?`, [id]);
        await db.exec(`DELETE FROM notes WHERE feed_id = ?`, [id]);
      }, 2500);
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

  const handleShareFeed = useCallback(async (id: string) => {
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

  const handleExpandEditor = (ast: string, propsJson: string, onSubmit: (ast: string, pj: string) => void) => {
    setFullscreenDraft({ ast, propsJson, onSubmit });
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

  const insertRootNote = async (astText: string, propsJson: string) => {
    if (!activeFeedId) return;
    const id = 'note-' + uid();
    const now = Date.now();
    await db.exec(
      `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, feed_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, focusedTweetId, nostrPubKey, feedEncrypt(astText), now.toString(), feedEncrypt(propsJson), activeFeedId, now, now]
    );
  };

  const handleInlineReply = async (parentId: string, astText: string, propsJson: string) => {
    if (!activeFeedId) return;
    const id = 'note-' + uid();
    const now = Date.now();
    await db.exec(
      `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, feed_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, parentId, nostrPubKey, feedEncrypt(astText), now.toString(), feedEncrypt(propsJson), activeFeedId, now, now]
    );
    setReplyingToTweetId(null);
  };

  const handleEditSubmit = async (noteId: string, astText: string, propsJson: string) => {
    // Lookup the feed_id of this note to encrypt with the correct FEK
    const rows = await db.execO(`SELECT feed_id FROM notes WHERE id = ?`, [noteId]) as any[];
    const noteFeedId = rows[0]?.feed_id || activeFeedId;
    const enc = noteFeedId ? (s: string) => encryptForFeed(s, noteFeedId) : encrypt;
    await db.exec(
      `UPDATE notes SET content = ?, properties = ?, updated_at = ? WHERE id = ?`,
      [enc(astText), enc(propsJson), Date.now(), noteId]
    );
    setEditingTweet(null);
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
      alert(`Импортировано ${notes.length} заметок`);
    } catch (err) { alert('Ошибка: ' + String(err)); }
    e.target.value = '';
  };

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
      style={{ display: 'flex', height: '100vh', background: 'var(--bg-page)' }}
      data-mobile-tab={mobileTab}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        if (window.innerWidth > 640) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        const target = e.target as Element;
        if (target.closest?.('.note-card-swipeable')) return;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          const tabs = ['dashboard', 'feed', 'calendar'] as const;
          const idx = tabs.indexOf(mobileTabRef.current);
          if (dx < 0 && idx < tabs.length - 1) setMobileTab(tabs[idx + 1]);
          else if (dx > 0 && idx > 0) setMobileTab(tabs[idx - 1]);
        }
      }}
    >
      {/* ── Feeds sidebar ── */}
      <FeedsSidebar
        feeds={feeds}
        activeFeedId={activeFeedId}
        onSelect={id => { setActiveFeedId(id); setFocusedTweetId(null); setReplyingToTweetId(null); if (window.innerWidth <= 640) { setMobileFeedsOpen(false); setMobileTab('feed'); } }}
        onCreateFeed={handleCreateFeed}
        onUpdateFeed={handleUpdateFeed}
        onDeleteFeed={handleDeleteFeed}
        onImportSharedFeed={handleImportSharedFeed}
        onShareFeed={handleShareFeed}
        onArchiveFeed={handleArchiveFeed}
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
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)', flexShrink: 0, letterSpacing: '-0.01em' }}>
            {activeFeed?.avatar
              ? <img src={activeFeed.avatar} onError={(e) => (e.currentTarget.style.display = 'none')} style={{ width: '1.2rem', height: '1.2rem', objectFit: 'cover', borderRadius: '50%', marginRight: '6px', verticalAlign: 'middle' }} />
              : null
            }
            {activeFeed?.name || 'Sheafy'}
          </h1>
          <span style={{ color: 'var(--text-faint)', fontSize: '0.8rem', flexShrink: 0 }}>
            {focusedTweetId ? '/ ветка' : ''}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
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
          />
        )}

        {/* Editor + Feed */}
        <div className="feed-area" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '760px' }}>
          {myFeedRole !== 'reader' && (
            <div style={{ flexShrink: 0 }}>
              <TweetEditor
                placeholder={focusedTweetId ? 'Оставить ответ в ветке...' : 'Что происходит?'}
                buttonText="Шифнуть"
                onSubmit={insertRootNote}
                autoFocus
                onExpand={(ast, pj) => {
                  setFullscreenDraft({ ast, propsJson: pj, onSubmit: insertRootNote });
                }}
              />
            </div>
          )}
          {myFeedRole === 'reader' && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-faint)', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius)', background: 'var(--bg-hover)', textAlign: 'center' }}>
              Только чтение — вы добавлены как читатель этой ленты
            </div>
          )}
          <Feed
            parentId={focusedTweetId}
            feedId={activeFeedId}
            isSharedFeed={!!activeFeed?.is_shared}
            localNpub={nostrPubKey}
            myRole={myFeedRole}
            onNoteClick={(id) => { setFocusedTweetId(id); setReplyingToTweetId(null); }}
            replyingToId={replyingToTweetId}
            editingNote={editingTweet}
            onStartReply={setReplyingToTweetId}
            onCancelReply={() => setReplyingToTweetId(null)}
            onSubmitReply={handleInlineReply}
            onStartEdit={setEditingTweet}
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
      />

      {fullscreenDraft && (
        <TweetEditor
          placeholder="Что происходит?"
          initialAst={fullscreenDraft.ast}
          initialPropsStr={fullscreenDraft.propsJson}
          onSubmit={(ast, pj) => { fullscreenDraft.onSubmit(ast, pj); setFullscreenDraft(null); }}
          onCancel={() => setFullscreenDraft(null)}
          autoFocus
          zenMode={true}
        />
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
            onSelect={id => { setActiveFeedId(id); setFocusedTweetId(null); setReplyingToTweetId(null); setMobileFeedsOpen(false); setMobileTab('feed'); }}
            onCreateFeed={handleCreateFeed}
            onUpdateFeed={handleUpdateFeed}
            onDeleteFeed={handleDeleteFeed}
            onImportSharedFeed={handleImportSharedFeed}
            onShareFeed={handleShareFeed}
            onArchiveFeed={handleArchiveFeed}
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
            onClick={() => setMobileTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {lightboxEntry && (
        <Lightbox url={lightboxEntry.url} name={lightboxEntry.name} onClose={() => setLightboxEntry(null)} />
      )}
    </div>
  );
}

export default App;
