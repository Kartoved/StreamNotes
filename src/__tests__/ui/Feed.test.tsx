// @vitest-environment happy-dom

/**
 * Feed UI tests (src/components/Feed.tsx)
 *
 * Feed is a heavily context-dependent, virtualised component.
 * Strategy:
 *  - Mock all contexts (useDB, useCrypto) and the data hook (useNotes)
 *  - Mock @tanstack/react-virtual so virtualiser renders every item
 *  - Mock NoteCard, TweetEditor, NoteModal as lightweight stubs
 *  - Test Feed behaviour: empty state, note count, search/tag/date filtering,
 *    context menu, delete confirmation
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────

// useNotes — controls the notes data the Feed receives
const mockUseNotes = vi.fn();

vi.mock('../../db/hooks', () => ({
  useNotes: (...args: any[]) => mockUseNotes(...args),
}));

// useDB — provides the database instance
const mockDb: any = {
  exec: vi.fn().mockResolvedValue(undefined),
  execA: vi.fn().mockResolvedValue([]),
  execO: vi.fn().mockResolvedValue([]),
};

vi.mock('../../db/DBContext', () => ({
  useDB: () => mockDb,
}));

// useCrypto — identity encrypt/decrypt + per-feed variants
vi.mock('../../crypto/CryptoContext', () => ({
  useCrypto: () => ({
    encrypt: (s: string) => s,
    decrypt: (s: string) => s,
    encryptForFeed: (s: string) => s,
    decryptForFeed: (s: string) => s,
  }),
}));

// @tanstack/react-virtual — render ALL items synchronously without scrolling
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 100,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        key: `vi-${i}`,
        index: i,
        start: i * 100,
        size: 100,
      })),
    measureElement: vi.fn(),
    scrollToIndex: vi.fn(),
    scrollToOffset: vi.fn(),
    scrollElement: null,
  }),
}));

// NoteCard — lightweight stub that exposes the note id for assertions
vi.mock('../../components/NoteCard', () => ({
  NoteCard: ({ note, openContextMenu }: { note: any; openContextMenu: (e: any, id: string) => void }) => (
    <div
      data-testid="note-card"
      data-note-id={note.id}
      onContextMenu={(e) => openContextMenu(e, note.id)}
    >
      {note.id}
    </div>
  ),
}));

// TweetEditor — stub
vi.mock('../../components/TiptapEditor', () => ({
  TweetEditor: ({ placeholder }: any) => (
    <div data-testid="tweet-editor">{placeholder}</div>
  ),
}));

// TiptapRender — stub
vi.mock('../../editor/TiptapViewer', () => ({
  TiptapRender: ({ astString }: { astString: string }) => (
    <div data-testid="tiptap-render">{astString}</div>
  ),
}));

// NoteModal — stub
vi.mock('../../components/NoteModal', () => ({
  NoteModal: ({ noteId, onClose }: { noteId: string; onClose: () => void }) => (
    <div data-testid="note-modal">
      <span>{noteId}</span>
      <button onClick={onClose}>Close modal</button>
    </div>
  ),
}));

// BacklinksSection — stub
vi.mock('../../components/BacklinksSection', () => ({
  BacklinksSection: () => <div data-testid="backlinks" />,
}));

// ── Component under test ───────────────────────────────────────────────
import { Feed } from '../../components/Feed';

// ── Helpers ────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<any> = {}): any {
  const id = overrides.id ?? `note-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    parent_id: null,
    author_id: 'local-user',
    content: JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: overrides.text ?? 'Sample note' }] }],
    }),
    properties: '{}',
    created_at: Date.now(),
    updated_at: Date.now(),
    sort_key: 'a',
    depth: 0,
    feed_id: null,
    is_deleted: 0,
    view_mode: 'normal',
    ...overrides,
  };
}

function renderFeed(props: Partial<React.ComponentProps<typeof Feed>> = {}) {
  return render(<Feed feedId={null} parentId={null} {...props} />);
}

// Stub document.querySelector used by useVirtualizer's getScrollElement
beforeEach(() => {
  vi.spyOn(document, 'querySelector').mockImplementation((sel) => {
    if (sel === '.main-content') return document.createElement('div');
    return null;
  });
  mockDb.exec.mockClear();
  mockDb.execA.mockClear();
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('Feed — empty state', () => {
  it('shows empty-state message when there are no notes', () => {
    mockUseNotes.mockReturnValue([]);
    renderFeed();
    expect(screen.getByText(/Пусто\. Напиши что-нибудь первым!/)).toBeInTheDocument();
  });

  it('does not render any NoteCard when notes is empty', () => {
    mockUseNotes.mockReturnValue([]);
    renderFeed();
    expect(screen.queryAllByTestId('note-card')).toHaveLength(0);
  });
});

describe('Feed — note list rendering', () => {
  it('renders one NoteCard per note', () => {
    const notes = [makeNote({ id: 'n1' }), makeNote({ id: 'n2' }), makeNote({ id: 'n3' })];
    mockUseNotes.mockReturnValue(notes);
    renderFeed();
    expect(screen.getAllByTestId('note-card')).toHaveLength(3);
  });

  it('renders NoteCards with correct note ids', () => {
    const notes = [makeNote({ id: 'alpha' }), makeNote({ id: 'beta' })];
    mockUseNotes.mockReturnValue(notes);
    renderFeed();
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('shows collapse/expand toolbar button', () => {
    mockUseNotes.mockReturnValue([makeNote()]);
    renderFeed();
    expect(screen.getByText(/Свернуть всё|Развернуть всё/)).toBeInTheDocument();
  });
});

describe('Feed — search filtering', () => {
  it('shows "Ничего не найдено" when search matches nothing', () => {
    const notes = [makeNote({ text: 'Apple pie recipe' })];
    mockUseNotes.mockReturnValue(notes);
    renderFeed({ searchQuery: 'quantum physics' });
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
    expect(screen.queryAllByTestId('note-card')).toHaveLength(0);
  });

  it('shows matching note when search query matches content', () => {
    const notes = [
      makeNote({ id: 'match', text: 'Hello Nostr world' }),
      makeNote({ id: 'no-match', text: 'Unrelated content' }),
    ];
    mockUseNotes.mockReturnValue(notes);
    renderFeed({ searchQuery: 'nostr' });
    const cards = screen.getAllByTestId('note-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute('data-note-id', 'match');
  });

  it('is case-insensitive', () => {
    const notes = [makeNote({ id: 'n1', text: 'UPPERCASE text' })];
    mockUseNotes.mockReturnValue(notes);
    renderFeed({ searchQuery: 'uppercase' });
    expect(screen.getAllByTestId('note-card')).toHaveLength(1);
  });

  it('shows all notes when search query is empty', () => {
    const notes = [makeNote(), makeNote(), makeNote()];
    mockUseNotes.mockReturnValue(notes);
    renderFeed({ searchQuery: '' });
    expect(screen.getAllByTestId('note-card')).toHaveLength(3);
  });
});

describe('Feed — tag filtering', () => {
  it('shows only notes that contain the selected tag', () => {
    const notes = [
      makeNote({ id: 'tagged', text: 'Post about #react' }),
      makeNote({ id: 'untagged', text: 'Post about cooking' }),
    ];
    mockUseNotes.mockReturnValue(notes);
    renderFeed({ selectedTags: new Set(['#react']) });
    const cards = screen.getAllByTestId('note-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute('data-note-id', 'tagged');
  });

  it('shows "Ничего не найдено" when no notes match the tag', () => {
    const notes = [makeNote({ text: 'No tags here' })];
    mockUseNotes.mockReturnValue(notes);
    renderFeed({ selectedTags: new Set(['#nonexistent']) });
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
  });
});

describe('Feed — date filtering', () => {
  it('shows only notes from the selected date', () => {
    const targetDate = '2024-06-15';
    const inDate = makeNote({ id: 'in', created_at: new Date(`${targetDate}T12:00:00Z`).getTime() });
    const outDate = makeNote({ id: 'out', created_at: new Date('2024-01-01T12:00:00Z').getTime() });
    mockUseNotes.mockReturnValue([inDate, outDate]);

    renderFeed({ selectedDate: targetDate });
    const cards = screen.getAllByTestId('note-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute('data-note-id', 'in');
  });
});

describe('Feed — context menu', () => {
  it('shows context menu on right-click of a NoteCard', () => {
    const notes = [makeNote({ id: 'n1' })];
    mockUseNotes.mockReturnValue(notes);
    renderFeed();

    const card = screen.getByTestId('note-card');
    fireEvent.contextMenu(card);

    // Context menu items include 'Ответить', 'Редактировать', etc.
    expect(screen.getByText('Ответить')).toBeInTheDocument();
    expect(screen.getByText('Редактировать')).toBeInTheDocument();
    expect(screen.getByText(/Удалить/)).toBeInTheDocument();
  });

  it('closes context menu when clicking the overlay', () => {
    const notes = [makeNote({ id: 'n1' })];
    mockUseNotes.mockReturnValue(notes);
    renderFeed();

    const card = screen.getByTestId('note-card');
    fireEvent.contextMenu(card);
    expect(screen.getByText('Ответить')).toBeInTheDocument();

    // Navigate up from the button → menu box → overlay (which has closeContextMenu)
    // Structure: overlay > menuBox > button
    const overlay = screen.getByText('Ответить').parentElement?.parentElement as HTMLElement;
    fireEvent.click(overlay);

    expect(screen.queryByText('Ответить')).not.toBeInTheDocument();
  });

  it('shows delete confirmation modal when "Удалить" is clicked in context menu', async () => {
    const notes = [makeNote({ id: 'n1' })];
    mockUseNotes.mockReturnValue(notes);
    renderFeed();

    fireEvent.contextMenu(screen.getByTestId('note-card'));
    fireEvent.click(screen.getByText(/🗑 Удалить/));

    await waitFor(() => {
      expect(screen.getByText(/Удалить эту заметку\?/)).toBeInTheDocument();
    });
  });

  it('cancels delete confirmation without calling db.exec', async () => {
    const notes = [makeNote({ id: 'n1' })];
    mockUseNotes.mockReturnValue(notes);
    renderFeed();

    fireEvent.contextMenu(screen.getByTestId('note-card'));
    fireEvent.click(screen.getByText(/🗑 Удалить/));

    await waitFor(() => screen.getByText('Отмена'));
    fireEvent.click(screen.getByText('Отмена'));

    expect(screen.queryByText(/Удалить эту заметку\?/)).not.toBeInTheDocument();
    expect(mockDb.exec).not.toHaveBeenCalledWith(
      expect.stringContaining('is_deleted'),
      expect.anything()
    );
  });

  it('calls db.exec to soft-delete when confirm is clicked', async () => {
    const notes = [makeNote({ id: 'del-me' })];
    mockUseNotes.mockReturnValue(notes);
    renderFeed();

    fireEvent.contextMenu(screen.getByTestId('note-card'));
    fireEvent.click(screen.getByText(/🗑 Удалить/));

    await waitFor(() => screen.getByText(/Удалить эту заметку\?/));
    // The confirm button is the red danger button in the modal
    const confirmBtn = screen.getByRole('button', { name: 'Удалить' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('is_deleted'),
        expect.arrayContaining(['del-me'])
      );
    });
  });
});

describe('Feed — collapse / expand all', () => {
  it('toggles "Свернуть всё" → "Развернуть всё" after click', () => {
    const notes = [makeNote(), makeNote()];
    mockUseNotes.mockReturnValue(notes);
    renderFeed();

    const btn = screen.getByText('Свернуть всё');
    fireEvent.click(btn);
    expect(screen.getByText('Развернуть всё')).toBeInTheDocument();
  });

  it('restores "Свернуть всё" on second click', () => {
    const notes = [makeNote(), makeNote()];
    mockUseNotes.mockReturnValue(notes);
    renderFeed();

    const btn = screen.getByText('Свернуть всё');
    fireEvent.click(btn);
    fireEvent.click(screen.getByText('Развернуть всё'));
    expect(screen.getByText('Свернуть всё')).toBeInTheDocument();
  });
});

describe('Feed — large datasets (virtualiser)', () => {
  it('renders 100 notes without throwing', () => {
    const notes = Array.from({ length: 100 }, (_, i) => makeNote({ id: `n${i}` }));
    mockUseNotes.mockReturnValue(notes);
    expect(() => renderFeed()).not.toThrow();
    expect(screen.getAllByTestId('note-card')).toHaveLength(100);
  });
});
