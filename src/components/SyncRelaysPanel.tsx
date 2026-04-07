// Settings panel for managing Nostr sync relays.
//
// Lists all entries from the `sync_relays` table, lets the user add/remove/toggle
// each one, and asks the running SyncEngine (exposed on window) to refresh after
// any change so the new relay set takes effect immediately.

import { useEffect, useState, useCallback } from 'react';
import { useDB } from '../db/DBContext';
import type { RelayState } from '../sync/types';

const labelStyle: React.CSSProperties = {
  fontSize: '0.72rem', color: 'var(--text-faint)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  fontWeight: 700,
  marginBottom: '8px', display: 'block',
};

const btn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--line)',
  color: 'var(--text)', borderRadius: '6px',
  padding: '6px 12px', fontSize: '0.75rem', cursor: 'pointer',
  fontFamily: 'inherit', fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--line)',
  borderRadius: '6px', padding: '8px 10px',
  color: 'var(--text)', fontFamily: 'var(--font-mono)',
  fontSize: '0.78rem', width: '100%', outline: 'none',
};

export default function SyncRelaysPanel() {
  const db = useDB();
  const [relays, setRelays] = useState<RelayState[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const rows = (await db.execO(
      `SELECT url, is_active, last_db_version, last_event_at, added_at
       FROM sync_relays ORDER BY added_at ASC`,
    )) as RelayState[];
    setRelays(rows);
  }, [db]);

  useEffect(() => { void reload(); }, [reload]);

  const refreshEngine = () => {
    const engine = (window as { __syncEngine?: { refreshRelays(): Promise<void> } }).__syncEngine;
    void engine?.refreshRelays();
  };

  const handleAdd = async () => {
    const url = newUrl.trim();
    if (!url) return;
    if (!/^wss?:\/\//.test(url)) {
      setError('URL must start with wss:// or ws://');
      return;
    }
    setError('');
    await db.exec(
      `INSERT OR IGNORE INTO sync_relays (url, is_active, last_db_version, last_event_at, added_at)
       VALUES (?, 1, 0, 0, ?)`,
      [url, Date.now()],
    );
    setNewUrl('');
    await reload();
    refreshEngine();
  };

  const handleToggle = async (url: string, current: number) => {
    await db.exec(`UPDATE sync_relays SET is_active = ? WHERE url = ?`, [current ? 0 : 1, url]);
    await reload();
    refreshEngine();
  };

  const handleRemove = async (url: string) => {
    await db.exec(`DELETE FROM sync_relays WHERE url = ?`, [url]);
    await reload();
    refreshEngine();
  };

  return (
    <div>
      <span style={labelStyle}>Sync Relays</span>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-sub)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Encrypted CRDT changes are pushed to all active relays. Add your own for redundancy or privacy.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
        {relays.length === 0 && (
          <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)', margin: 0 }}>No relays configured.</p>
        )}
        {relays.map((r) => (
          <div
            key={r.url}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 10px', borderRadius: '6px',
              background: 'var(--bg-hover)', border: '1px solid var(--line)',
            }}
          >
            <span
              style={{
                width: 8, height: 8, borderRadius: 4,
                background: r.is_active ? '#22c55e' : 'var(--text-faint)',
                flexShrink: 0,
              }}
              title={r.is_active ? 'active' : 'paused'}
            />
            <code style={{ flex: 1, fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.url}
            </code>
            <button onClick={() => handleToggle(r.url, r.is_active)} style={{ ...btn, padding: '4px 8px' }}>
              {r.is_active ? 'Pause' : 'Resume'}
            </button>
            <button onClick={() => handleRemove(r.url)} style={{ ...btn, padding: '4px 8px', borderColor: 'var(--line)', color: 'var(--text-faint)' }}>
              ×
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          style={inputStyle}
          placeholder="wss://your.relay.example"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button onClick={handleAdd} style={btn}>Add</button>
      </div>
      {error && (
        <p style={{ fontSize: '0.72rem', color: '#f87171', margin: '8px 0 0' }}>{error}</p>
      )}
    </div>
  );
}
