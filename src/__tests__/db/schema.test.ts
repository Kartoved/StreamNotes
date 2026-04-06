/**
 * Schema & migration shape tests (static, no WASM needed).
 * Validates that all SQL strings are well-formed and that the migration
 * list is additive (no DROPs, no destructive changes).
 */
import { describe, it, expect } from 'vitest';
import { schema, migrations } from '../../db/schema';

describe('schema array', () => {
  it('is non-empty', () => {
    expect(schema.length).toBeGreaterThan(0);
  });

  it('contains CREATE TABLE for feeds', () => {
    const hasFeedsTable = schema.some(s =>
      s.includes('CREATE TABLE') && s.toLowerCase().includes('feeds')
    );
    expect(hasFeedsTable).toBe(true);
  });

  it('contains CREATE TABLE for notes', () => {
    const hasNotesTable = schema.some(s =>
      s.includes('CREATE TABLE') && s.toLowerCase().includes('notes')
    );
    expect(hasNotesTable).toBe(true);
  });

  it('contains CREATE TABLE for links', () => {
    const hasLinksTable = schema.some(s =>
      s.includes('CREATE TABLE') && s.toLowerCase().includes('links')
    );
    expect(hasLinksTable).toBe(true);
  });

  it('enables CRDT on all core tables', () => {
    const crr = schema.filter(s => s.includes('crsql_as_crr'));
    expect(crr.length).toBeGreaterThanOrEqual(3); // feeds, notes, links
  });

  it('feeds table has encryption columns', () => {
    const feedsDDL = schema.find(s =>
      s.includes('CREATE TABLE') && s.toLowerCase().includes('feeds')
    )!;
    expect(feedsDDL).toContain('encryption_key');
    expect(feedsDDL).toContain('key_index');
    expect(feedsDDL).toContain('is_shared');
  });

  it('notes table has author_id column', () => {
    const notesDDL = schema.find(s =>
      s.includes('CREATE TABLE') && s.toLowerCase().includes('notes')
    )!;
    expect(notesDDL).toContain('author_id');
  });

  it('notes table has feed_id column', () => {
    const notesDDL = schema.find(s =>
      s.includes('CREATE TABLE') && s.toLowerCase().includes('notes')
    )!;
    expect(notesDDL).toContain('feed_id');
  });

  it('all queries end with semicolon', () => {
    for (const q of schema) {
      expect(q.trim().endsWith(';')).toBe(true);
    }
  });
});

describe('migrations array', () => {
  it('is defined and is an array', () => {
    expect(Array.isArray(migrations)).toBe(true);
  });

  it('contains only ALTER TABLE statements (additive only)', () => {
    for (const m of migrations) {
      const upper = m.trim().toUpperCase();
      expect(upper.startsWith('ALTER TABLE')).toBe(true);
    }
  });

  it('never drops columns (no DROP COLUMN)', () => {
    for (const m of migrations) {
      expect(m.toUpperCase()).not.toContain('DROP COLUMN');
      expect(m.toUpperCase()).not.toContain('DROP TABLE');
    }
  });

  it('adds the encryption columns to feeds', () => {
    const addsEncKey = migrations.some(m =>
      m.includes('feeds') && m.includes('encryption_key')
    );
    const addsKeyIndex = migrations.some(m =>
      m.includes('feeds') && m.includes('key_index')
    );
    const addsIsShared = migrations.some(m =>
      m.includes('feeds') && m.includes('is_shared')
    );
    expect(addsEncKey).toBe(true);
    expect(addsKeyIndex).toBe(true);
    expect(addsIsShared).toBe(true);
  });
});
