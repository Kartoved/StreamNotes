// Thin wrapper around nostr-tools' SimplePool.
//
// Responsibilities:
//   - own a single pool instance
//   - expose connect/publish/subscribe/disconnect
//   - track per-relay connection status for the UI
//   - guard against null/undefined relay arrays
//
// Reconnection and per-relay error handling are mostly delegated to nostr-tools
// (SimplePool re-opens dropped sockets transparently).

import { SimplePool } from 'nostr-tools/pool';
import type { Event } from 'nostr-tools/core';
import type { Filter } from 'nostr-tools/filter';

export type RelayStatus = 'connecting' | 'connected' | 'error' | 'disconnected';

export interface RelayClientOptions {
  onStatusChange?: (url: string, status: RelayStatus) => void;
}

export class RelayClient {
  private pool: SimplePool;
  private relays: string[] = [];
  private status = new Map<string, RelayStatus>();
  private subs: Array<{ close: (reason?: string) => void }> = [];
  private opts: RelayClientOptions;

  constructor(opts: RelayClientOptions = {}) {
    this.opts = opts;
    this.pool = new SimplePool();
  }

  /** Replace the active relay set. Idempotent. */
  setRelays(urls: string[]): void {
    const next = Array.from(new Set(urls.filter(Boolean)));
    this.relays = next;
    for (const u of next) {
      if (!this.status.has(u)) {
        this.status.set(u, 'connecting');
        this.opts.onStatusChange?.(u, 'connecting');
      }
    }
    // Drop status for relays no longer present
    for (const u of Array.from(this.status.keys())) {
      if (!next.includes(u)) {
        this.status.delete(u);
        this.opts.onStatusChange?.(u, 'disconnected');
      }
    }
  }

  getRelays(): string[] {
    return [...this.relays];
  }

  getStatus(url: string): RelayStatus {
    return this.status.get(url) ?? 'disconnected';
  }

  /** Publish an event to all currently active relays. Returns when all settled. */
  async publish(event: Event): Promise<void> {
    if (!this.relays.length) {
      console.warn('[relay] publish called but no relays configured');
      return;
    }
    const promises = this.pool.publish(this.relays, event);
    const results = await Promise.allSettled(promises);
    results.forEach((res, i) => {
      const url = this.relays[i];
      if (!url) return;
      if (res.status === 'fulfilled') {
        console.log('[relay] published to', url);
        if (this.status.get(url) !== 'connected') {
          this.status.set(url, 'connected');
          this.opts.onStatusChange?.(url, 'connected');
        }
      } else {
        console.error('[relay] publish failed to', url, res.reason);
        this.status.set(url, 'error');
        this.opts.onStatusChange?.(url, 'error');
      }
    });
  }

  /** Subscribe to events matching the filter. Returns an unsubscribe fn. */
  subscribe(filter: Filter, onEvent: (event: Event) => void): () => void {
    if (!this.relays.length) return () => {};
    const sub = this.pool.subscribeMany(this.relays, filter, {
      onevent: (event) => {
        try {
          onEvent(event);
        } catch (err) {
          console.error('[sync] onEvent handler failed', err);
        }
      },
    });
    this.subs.push(sub);
    return () => {
      try { sub.close(); } catch { /* ignore */ }
      this.subs = this.subs.filter((s) => s !== sub);
    };
  }

  /** Tear down all subscriptions and close pool. */
  destroy(): void {
    for (const sub of this.subs) {
      try { sub.close(); } catch { /* ignore */ }
    }
    this.subs = [];
    try { this.pool.close(this.relays); } catch { /* ignore */ }
  }
}
