// @vitest-environment happy-dom

/**
 * NoteCard UI tests
 *
 * NoteCard is a pure-presentational component — it receives all data and
 * callbacks as props. Heavy internal dependencies (TiptapRender, TweetEditor)
 * are stubbed so tests focus on structure and behaviour, not editor internals.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';

// ── Module mocks (must be at top level, hoisted by vitest) ─────────────
vi.mock('../../editor/TiptapViewer', () => ({
  TiptapRender: ({ astString }: { astString: string }) => (
    <div data-testid="tiptap-render">{astString}</div>
  ),
}));

vi.mock('../../components/TiptapEditor', () => ({
  TweetEditor: ({ placeholder, buttonText, onCancel, onSubmit }: any) => (
    <div data-testid="tweet-editor">
      <span data-testid="editor-placeholder">{placeholder}</span>
      <button onClick={() => onSubmit?.('{}', '{}')}>{buttonText}</button>
      <button onClick={() => onCancel?.()}>Cancel</button>
    </div>
  ),
}));

afterEach(() => cleanup());

// ── Component under test ───────────────────────────────────────────────
import { NoteCard } from '../../components/NoteCard';

// ── Helpers ────────────────────────────────────────────────────────────
const identity = (s: string) => s;

function makeNote(overrides: Partial<ReturnType<typeof defaultNote>> = {}) {
  return { ...defaultNote(), ...overrides };
}

function defaultNote() {
  return {
    id: 'note-1',
    parent_id: null,
    author_id: 'local-user',
    content: JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
    }),
    properties: '{}',
    created_at: new Date('2024-06-15T09:30:00Z').getTime(),
    sort_key: 'a',
    depth: 0,
    feed_id: null,
    is_deleted: 0,
    view_mode: 'normal',
    updated_at: 0,
  };
}

function makeVirtualItem(index = 0) {
  return { key: `vi-${index}`, index, start: index * 100, size: 100 };
}

const makeVirtualizer = () => ({ measureElement: vi.fn(), scrollToIndex: vi.fn() });

function makeMockDb() {
  return { exec: vi.fn().mockResolvedValue(undefined), execA: vi.fn().mockResolvedValue([]) };
}

function defaultProps(overrides = {}) {
  return {
    note: makeNote(),
    virtualItem: makeVirtualItem(),
    virtualizer: makeVirtualizer(),
    indent: 0,
    isReplying: false,
    editingNoteId: null,
    draggedId: null,
    dragOverInfo: null,
    onNoteClick: vi.fn(),
    openContextMenu: vi.fn(),
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    onDragEnd: vi.fn(),
    onCancelEdit: vi.fn(),
    onSubmitEdit: vi.fn(),
    onCancelReply: vi.fn(),
    onSubmitReply: vi.fn(),
    onExpandNote: vi.fn(),
    setDragOverInfo: vi.fn(),
    encrypt: identity,
    decrypt: identity,
    db: makeMockDb(),
    isSharedFeed: false,
    localNpub: 'local-user',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('NoteCard — basic render', () => {
  it('renders "you" label for local author', () => {
    render(<NoteCard {...defaultProps()} />);
    expect(screen.getByText('you')).toBeInTheDocument();
  });

  it('renders truncated author ID for remote author in non-shared feed', () => {
    const props = defaultProps({
      note: makeNote({ author_id: 'npub1abc123def456' }),
      localNpub: 'someone-else',
    });
    render(<NoteCard {...props} />);
    // Shows first 8 chars of the non-matching author_id
    expect(screen.getByText('npub1abc')).toBeInTheDocument();
  });

  it('renders a timestamp', () => {
    render(<NoteCard {...defaultProps()} />);
    // The time should appear somewhere (exact format is locale-dependent)
    const timeEls = document.querySelectorAll('[style*="font-mono"]');
    expect(timeEls.length).toBeGreaterThan(0);
  });

  it('renders note content via TiptapRender', () => {
    render(<NoteCard {...defaultProps()} />);
    expect(screen.getByTestId('tiptap-render')).toBeInTheDocument();
  });

  it('passes the content string to TiptapRender', () => {
    const content = JSON.stringify({ type: 'doc', content: [] });
    const props = defaultProps({ note: makeNote({ content }) });
    render(<NoteCard {...props} />);
    expect(screen.getByTestId('tiptap-render').textContent).toBe(content);
  });
});

describe('NoteCard — props row (status / date chips)', () => {
  it('does NOT show props row when status is "none" and no date', () => {
    render(<NoteCard {...defaultProps()} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows PropChip (select) when properties contain a non-"none" status', () => {
    const props = defaultProps({
      note: makeNote({ properties: JSON.stringify({ status: 'todo' }) }),
    });
    render(<NoteCard {...props} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect((select as HTMLSelectElement).value).toBe('todo');
  });

  it('shows DateChip (button) when properties contain a date', () => {
    const props = defaultProps({
      note: makeNote({ properties: JSON.stringify({ date: '2024-12-31' }) }),
    });
    render(<NoteCard {...props} />);
    expect(screen.getByText('2024-12-31')).toBeInTheDocument();
  });

  it('hides props row again when status is "done" via state sync useEffect', async () => {
    // Render with "done" then re-render with "none" (simulate external DB update)
    const { rerender } = render(
      <NoteCard {...defaultProps({ note: makeNote({ properties: JSON.stringify({ status: 'done' }) }) })} />
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();

    rerender(
      <NoteCard {...defaultProps({ note: makeNote({ properties: '{}' }) })} />
    );
    await waitFor(() => {
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });
  });
});

describe('NoteCard — status chip interaction', () => {
  it('calls db.exec when status changes via PropChip', async () => {
    const db = makeMockDb();
    const props = defaultProps({
      note: makeNote({ properties: JSON.stringify({ status: 'todo' }) }),
      db,
    });
    render(<NoteCard {...props} />);

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'doing');

    await waitFor(() => {
      expect(db.exec).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notes SET properties'),
        expect.any(Array)
      );
    });
  });
});

describe('NoteCard — click interactions', () => {
  it('calls onNoteClick with note id when header area is clicked', () => {
    const onNoteClick = vi.fn();
    render(<NoteCard {...defaultProps({ onNoteClick })} />);

    // The clickable header row contains the author label
    fireEvent.click(screen.getByText('you'));
    expect(onNoteClick).toHaveBeenCalledWith('note-1');
  });

  it('calls openContextMenu when right-clicking the card body', () => {
    const openContextMenu = vi.fn();
    render(<NoteCard {...defaultProps({ openContextMenu })} />);

    // React uses event delegation — fire contextMenu on the content node;
    // it bubbles up to the onContextMenu handler wrapping the card body.
    fireEvent.contextMenu(screen.getByTestId('tiptap-render'));

    expect(openContextMenu).toHaveBeenCalled();
  });
});

describe('NoteCard — edit mode', () => {
  it('shows TweetEditor with edit placeholder when editingNoteId matches', () => {
    const props = defaultProps({ editingNoteId: 'note-1' });
    render(<NoteCard {...props} />);

    expect(screen.getByTestId('tweet-editor')).toBeInTheDocument();
    expect(screen.getByTestId('editor-placeholder').textContent).toBe('Редактировать...');
  });

  it('hides TiptapRender when in edit mode', () => {
    const props = defaultProps({ editingNoteId: 'note-1' });
    render(<NoteCard {...props} />);
    expect(screen.queryByTestId('tiptap-render')).not.toBeInTheDocument();
  });

  it('calls onCancelEdit when editor cancel is clicked', () => {
    const onCancelEdit = vi.fn();
    const props = defaultProps({ editingNoteId: 'note-1', onCancelEdit });
    render(<NoteCard {...props} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancelEdit).toHaveBeenCalled();
  });

  it('calls onSubmitEdit with note id when editor submit is clicked', () => {
    const onSubmitEdit = vi.fn();
    const props = defaultProps({ editingNoteId: 'note-1', onSubmitEdit });
    render(<NoteCard {...props} />);

    fireEvent.click(screen.getByText('Сохранить'));
    expect(onSubmitEdit).toHaveBeenCalledWith('note-1', '{}', '{}');
  });
});

describe('NoteCard — reply mode', () => {
  it('shows reply TweetEditor when isReplying is true', () => {
    const props = defaultProps({ isReplying: true });
    render(<NoteCard {...props} />);

    expect(screen.getByTestId('tweet-editor')).toBeInTheDocument();
    expect(screen.getByTestId('editor-placeholder').textContent).toBe('Напиши ответ...');
  });

  it('calls onSubmitReply with note id when reply is submitted', () => {
    const onSubmitReply = vi.fn();
    const props = defaultProps({ isReplying: true, onSubmitReply });
    render(<NoteCard {...props} />);

    fireEvent.click(screen.getByText('Отправить'));
    expect(onSubmitReply).toHaveBeenCalledWith('note-1', '{}', '{}');
  });
});

describe('NoteCard — nested notes', () => {
  it('renders vertical connector line for depth > 0', () => {
    const props = defaultProps({ note: makeNote({ depth: 2 }), indent: 48 });
    const { container } = render(<NoteCard {...props} />);

    // The connector line div is absolutely positioned with width: 1px
    const line = container.querySelector('[style*="width: 1px"]');
    expect(line).toBeInTheDocument();
  });

  it('does NOT render connector line for depth 0 (top-level)', () => {
    const props = defaultProps({ note: makeNote({ depth: 0 }) });
    const { container } = render(<NoteCard {...props} />);
    expect(container.querySelector('[style*="width: 1px"]')).not.toBeInTheDocument();
  });
});

describe('NoteCard — edge cases', () => {
  it('handles malformed properties JSON gracefully (no crash)', () => {
    const props = defaultProps({
      note: makeNote({ properties: '{INVALID JSON}' }),
    });
    expect(() => render(<NoteCard {...props} />)).not.toThrow();
  });

  it('handles empty content string gracefully', () => {
    const props = defaultProps({ note: makeNote({ content: '' }) });
    expect(() => render(<NoteCard {...props} />)).not.toThrow();
  });

  it('handles extremely long note title without layout crash', () => {
    const longText = 'A'.repeat(2000);
    const props = defaultProps({
      note: makeNote({
        content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: longText }] }] }),
      }),
    });
    expect(() => render(<NoteCard {...props} />)).not.toThrow();
    expect(screen.getByTestId('tiptap-render')).toBeInTheDocument();
  });

  it('renders opacity 0.3 when note is being dragged (draggedId matches)', () => {
    const props = defaultProps({ draggedId: 'note-1' });
    const { container } = render(<NoteCard {...props} />);
    const card = container.querySelector('.note-card') as HTMLElement;
    expect(card.style.opacity).toBe('0.3');
  });

  it('renders full opacity when draggedId does not match', () => {
    const props = defaultProps({ draggedId: 'other-note' });
    const { container } = render(<NoteCard {...props} />);
    const card = container.querySelector('.note-card') as HTMLElement;
    expect(card.style.opacity).toBe('1');
  });
});

describe('NoteCard — shared feed author badge', () => {
  it('shows AuthorBadge with "you" for local npub in shared feed', () => {
    const npub = 'npub1localuser';
    const props = defaultProps({
      isSharedFeed: true,
      localNpub: npub,
      note: makeNote({ author_id: npub }),
    });
    render(<NoteCard {...props} />);
    expect(screen.getByText('you')).toBeInTheDocument();
  });

  it('shows truncated remote npub in shared feed for non-local author', () => {
    const localNpub = 'npub1local';
    const remoteNpub = 'npub1remotexyz9876';
    const props = defaultProps({
      isSharedFeed: true,
      localNpub,
      note: makeNote({ author_id: remoteNpub }),
    });
    render(<NoteCard {...props} />);
    // AuthorBadge shows first 6 chars + … + last 4 chars
    expect(screen.getByText(/npub1r.*9876/)).toBeInTheDocument();
  });
});
