import React, { useState, useCallback, useRef } from 'react';
import { TweetEditor } from './TiptapEditor';
import { TiptapRender } from '../editor/TiptapViewer';
import { useCrypto } from '../crypto/CryptoContext';
import { IconCheck, IconPin, IconRepeat, IconCalendar, IconReply } from './icons';
import { CHIP_BASE, CHIP_SELECT, CHIP_ACTIVE, CHIP_HEIGHT } from './chipStyle';
import { SkillChip, NoteSkill } from './SkillChip';
import { getNoteKind } from '../utils/noteKind';
import { getAllSkillNames } from '../db/notesCache';
import { playDoneSound } from '../utils/skillSound';

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DAYS_RU   = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function formatNoteDate(createdAt: number): string {
  const now = new Date();
  const d   = new Date(createdAt);
  const hh  = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const time = `${hh}:${min}`;

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const noteDay   = new Date(d.getFullYear(),   d.getMonth(),   d.getDate()).getTime();
  const diffDays  = Math.round((todayStart - noteDay) / 86400000);

  if (diffDays === 0) return time;
  if (diffDays < 7)  return `${DAYS_RU[d.getDay()]} ${time}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

const STATUSES = ['note', 'todo', 'doing', 'done', 'archived'];

// Stable empty reference so React.memo doesn't see a "new" array each render.
const EMPTY_BACKLINKS: ReadonlyArray<{ id: string; snippet: string }> = [];

const VALID_STATUSES = new Set(['note', 'todo', 'doing', 'done', 'archived']);

// Derive the display status from raw properties, handling legacy formats.
function normalizeStatus(props: any): string {
  if (props.kind === 'note') return 'note';
  const s = props.status;
  if (s && VALID_STATUSES.has(s)) return s;
  // Legacy status='none' or missing: classify by task signals
  if (props.skill || props.recurrence || props.date) return 'todo';
  return 'note';
}

// ── Deterministic color from npub ──────────────────────────────────
function npubColor(npub: string): string {
  let hash = 0;
  for (let i = 0; i < npub.length; i++) hash = ((hash << 5) - hash + npub.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

function AuthorBadge({ authorId, isLocal }: { authorId: string; isLocal: boolean }) {
  const { nickname } = useCrypto();
  const color = npubColor(authorId);
  const label = isLocal ? nickname : `${authorId.slice(0, 6)}…${authorId.slice(-4)}`;
  return (
    <span style={{
      fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.02em',
      color: 'var(--text-sub)',
      fontFamily: 'var(--font-mono)',
    }}>
      {label}
    </span>
  );
}

// ── Status chip CSS-variable mappings ───────────────────────────────
const STATUS_TEXT_VAR: Record<string, string> = {
  note:     'var(--text-faint)',
  none:     'var(--text-faint)',
  todo:     'var(--chip-todo-text)',
  doing:    'var(--chip-doing-text)',
  done:     'var(--chip-done-text)',
  archived: 'var(--text-faint)',
};
const STATUS_BG_VAR: Record<string, string> = {
  note:     'var(--bg-hover)',
  none:     'var(--bg-hover)',
  todo:     'var(--chip-todo-bg)',
  doing:    'var(--chip-doing-bg)',
  done:     'var(--chip-done-bg)',
  archived: 'var(--bg-hover)',
};

// ── Inline editable prop chip ───────────────────────────────────────
export function PropChip({
  value, options, onChange,
}: {
  value: string; options: string[]; onChange: (v: string) => void; mono?: boolean;
}) {
  const isStatus = options === STATUSES;
  const color = isStatus ? (STATUS_TEXT_VAR[value] || 'var(--text-sub)') : 'var(--text-sub)';
  const bg    = isStatus ? (STATUS_BG_VAR[value]   || 'var(--bg-hover)') : 'var(--bg-hover)';

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        ...CHIP_SELECT,
        background: bg,
        color,
        borderColor: 'transparent',
        fontWeight: 600,
        textAlign: 'center',
        minWidth: '60px',
      }}
    >
      {options.map(opt => (
        <option key={opt} value={opt} style={{ background: 'var(--bg)', color: (isStatus && STATUS_TEXT_VAR[opt]) ? STATUS_TEXT_VAR[opt] : 'var(--text)' }}>
          {opt}
        </option>
      ))}
    </select>
  );
}

// ── Date chip ───────────────────────────────────────────────────────
export function DateChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={e => e.stopPropagation()}>
        <input
          type="date"
          autoFocus
          defaultValue={value}
          onChange={e => { if (e.target.value) onChange(e.target.value); }}
          onBlur={e => {
            if ((e.relatedTarget as HTMLElement)?.dataset?.clearDate) return;
            setEditing(false);
          }}
          style={{
            ...CHIP_BASE,
            background: 'var(--bg)',
            borderColor: 'var(--line-strong)',
            color: 'var(--text)',
          }}
        />
        <button
          type="button"
          data-clear-date="1"
          onMouseDown={e => { e.preventDefault(); onChange(''); setEditing(false); }}
          style={{
            background: 'transparent', border: 'none', color: 'var(--text-faint)',
            fontSize: '0.7rem', cursor: 'pointer', padding: '0 2px',
            fontFamily: 'var(--font-body)',
          }}
        >Сбросить</button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      style={CHIP_BASE}
    ><IconCalendar size={11} /><span>{value}</span></button>
  );
}

// ── Completion date chip (read-only) ────────────────────────────────
export function CompletionDateChip({ value }: { value: string }) {
  return (
    <span style={{ ...CHIP_BASE, cursor: 'default' }}>
      <IconCheck size={11} /><span>{value}</span>
    </span>
  );
}

// ── Recurrence chip ──────────────────────────────────────────────────
// Value semantics: ''   → off (no recurrence)
//                  '0'  → repeat immediately on done (next instance has no date)
//                  'N>0'→ repeat in N days
export function RecurrenceChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const parsed = parseInt(value);
  const active = !Number.isNaN(parsed) && parsed >= 0;
  const label = !active ? 'off' : parsed === 0 ? 'сразу' : `${parsed}d`;

  if (editing) {
    return (
      <input
        type="number"
        min="0"
        autoFocus
        defaultValue={active ? String(parsed) : ''}
        placeholder="дн."
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (raw === '') { onChange(''); setEditing(false); return; }
          const n = parseInt(raw);
          onChange(!Number.isNaN(n) && n >= 0 ? `${n}` : '');
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setEditing(false); }
        }}
        onClick={e => e.stopPropagation()}
        style={{
          ...CHIP_BASE,
          width: '60px',
          background: 'var(--bg)',
          borderColor: 'var(--line-strong)',
          color: 'var(--text)',
        }}
      />
    );
  }
  const style = active
    ? CHIP_ACTIVE('#6095ed', 'rgba(96, 149, 237, 0.12)', 'rgba(96, 149, 237, 0.30)')
    : CHIP_BASE;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      style={style}
      title="Повторяемость: пусто = off, 0 = сразу, N = через N дней"
    ><IconRepeat size={11} /><span>{label}</span></button>
  );
}

interface NoteCardProps {
  note: any;
  virtualItem: any;
  virtualizer: any;
  indent: number;
  isReplying: boolean;
  editingNoteId: string | null;
  draggedId: string | null;
  dragOverInfo: { id: string; zone: 'sibling' | 'child' } | null;

  onNoteClick?: (id: string) => void;
  openContextMenu: (e: React.MouseEvent, id: string) => void;
  openContextMenuAt?: (x: number, y: number, id: string) => void;
  onStartReply?: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;

  onCancelEdit?: () => void;
  onSubmitEdit?: (id: string, ast: string, propsJson: string) => void;
  onCancelReply?: () => void;
  onSubmitReply?: (id: string, ast: string, propsJson: string) => void;
  onExpandNote?: (id: string) => void;

  setDragOverInfo: (info: { id: string; zone: 'sibling' | 'child' } | null) => void;
  encrypt: (s: string) => string;
  decrypt: (s: string) => string;
  db: any;
  isSharedFeed?: boolean;
  localNpub?: string;
  onTouchDragStart?: (id: string, touch: { clientX: number; clientY: number }) => void;
  collapsedChildCount?: number;
  backlinks?: ReadonlyArray<{ id: string; snippet: string }>;
  defaultBacklinksOpen?: boolean;
  onCopyChip?: (name: string) => void;
}

export const NoteCard = React.memo(function NoteCard({
  note,
  virtualItem,
  virtualizer,
  indent,
  isReplying,
  editingNoteId,
  draggedId,
  dragOverInfo,
  onNoteClick,
  openContextMenu,
  openContextMenuAt,
  onStartReply,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onCancelEdit,
  onSubmitEdit,
  onCancelReply,
  onSubmitReply,
  onExpandNote,
  setDragOverInfo,
  encrypt,
  decrypt,
  db,
  isSharedFeed = false,
  localNpub = '',
  onTouchDragStart,
  collapsedChildCount = 0,
  backlinks = EMPTY_BACKLINKS,
  defaultBacklinksOpen = false,
  onCopyChip,
}: NoteCardProps) {
  const { decryptForFeed } = useCrypto();
  // note.properties is already decrypted by useNotes → getOrDecrypt
  const props = React.useMemo(() => {
    try { return JSON.parse(note.properties || '{}'); }
    catch { return {}; }
  }, [note.properties]);

  const [status, setStatus]     = useState<string>(normalizeStatus(props));
  const [type, setType]         = useState<string>(props.type || 'sheaf');
  const [targetDate, setDate]   = useState<string>(props.date || '');
  const [completedAt, setCompletedAt] = useState<string>(props.completed_at || '');
  const [recurrence, setRecurrence] = useState<string>(props.recurrence || '');
  const [skill, setSkill] = useState<NoteSkill | undefined>(props.skill);
  const [backlinksOpen, setBacklinksOpen] = useState(defaultBacklinksOpen);
  // If the open-by-default flag flips (we move in/out of expand mode), reflect it.
  React.useEffect(() => { setBacklinksOpen(defaultBacklinksOpen); }, [defaultBacklinksOpen]);

  // Synchronize state when underlying note properties change
  React.useEffect(() => {
    setStatus(normalizeStatus(props));
    setType(props.type || 'sheaf');
    setDate(props.date || '');
    setCompletedAt(props.completed_at || '');
    setRecurrence(props.recurrence || '');
    setSkill(props.skill);
  }, [props]);

  // Save a single prop change to DB immediately
  const saveProp = useCallback(async (key: string, val: any) => {
    const current: any = { ...props, status, type, date: targetDate, recurrence, skill, [key]: val };
    delete current.kind; // remove legacy kind field
    if (key === 'skill' && val === undefined) delete current.skill;
    if (key === 'status' && val === 'note') {
      // Switching to note: strip task-only metadata.
      current.date = '';
      current.recurrence = '';
      delete current.skill;
      delete current.completed_at;
    }
    // Track when a note is marked as done
    if (key === 'status' && val === 'done') {
      const today = new Date();
      current.completed_at = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      // Snapshot streak multiplier at done-transition. Frozen here so future
      // streak changes don't retroactively rescale historical XP.
      if (current.skill && typeof current.skill.xp === 'number') {
        const mult = (window as any).__streakMultiplier?.() ?? 0;
        current.skill = { ...current.skill, streakBonus: mult };
      }
      // Reward sound on done transition (only when transitioning to done from non-done).
      if (status !== 'done') playDoneSound();
    } else if (key === 'status' && val !== 'done') {
      delete current.completed_at;
      // Strip streak bonus snapshot when leaving done — applies again on re-done.
      if (current.skill && current.skill.streakBonus !== undefined) {
        const { streakBonus: _drop, ...rest } = current.skill;
        current.skill = rest;
      }
    }
    await db.exec(
      `UPDATE notes SET properties = ?, updated_at = ? WHERE id = ?`,
      [encrypt(JSON.stringify(current)), Date.now(), note.id]
    );

    // Recurring task: deep-clone the entire subtree as the next instance.
    // recurrence === ''  → no recurrence
    // recurrence === '0' → immediate (next root has no date — lands in backlog)
    // recurrence === 'N' → next root scheduled N days from today
    const rec = current.recurrence;
    const days = rec === '' ? NaN : parseInt(rec);
    if (key === 'status' && val === 'done' && !Number.isNaN(days) && days >= 0) {
      const now = Date.now();
      const newRootId = 'note-' + Math.random().toString(36).substring(2, 9);

      // Root keeps recurrence + skill; date derived from `days`.
      const rootProps: any = { status: 'todo', type: current.type, recurrence: rec };
      if (current.skill) rootProps.skill = current.skill;
      if (days > 0) {
        const next = new Date();
        next.setDate(next.getDate() + days);
        rootProps.date = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
      }

      await db.exec(
        `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, feed_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        [newRootId, null, note.author_id, encrypt(note.content), now.toString(), encrypt(JSON.stringify(rootProps)), note.feed_id, now, now]
      );

      // Pull all descendants of the original note. Columns are encrypted —
      // decrypt with the appropriate key per row before re-encrypting.
      const descendants = await db.execO(
        `WITH RECURSIVE tree AS (
           SELECT * FROM notes WHERE parent_id = ? AND is_deleted = 0
           UNION ALL
           SELECT n.* FROM notes n JOIN tree t ON n.parent_id = t.id WHERE n.is_deleted = 0
         ) SELECT * FROM tree`,
        [note.id]
      ) as any[];

      if (descendants.length > 0) {
        const idMap = new Map<string, string>();
        idMap.set(note.id, newRootId);
        for (const d of descendants) {
          idMap.set(d.id, 'note-' + Math.random().toString(36).substring(2, 9));
        }

        for (const d of descendants) {
          const dec = d.feed_id ? (s: string) => decryptForFeed(s, d.feed_id) : decrypt;
          let plainContent: string;
          let dProps: any;
          try {
            plainContent = dec(d.content);
            dProps = JSON.parse(dec(d.properties));
          } catch {
            // Skip un-decryptable descendant — its own subtree is lost too,
            // since further children reference an id we won't insert.
            continue;
          }

          // Reset per-iteration state: done → todo, no inherited date,
          // children don't carry their own recurrence (only the root spawns).
          const newProps: any = { ...dProps };
          if (newProps.status === 'done') newProps.status = 'todo';
          delete newProps.date;
          delete newProps.completed_at;
          delete newProps.recurrence;

          const newId = idMap.get(d.id)!;
          const newParentId = idMap.get(d.parent_id) || null;

          await db.exec(
            `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, feed_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
            [newId, newParentId, d.author_id, encrypt(plainContent), d.sort_key, encrypt(JSON.stringify(newProps)), d.feed_id, now, now]
          );
        }
      }
    }
  }, [db, encrypt, decrypt, decryptForFeed, note, props, status, type, targetDate, recurrence, skill]);

  const handleStatus = (v: string) => {
    setStatus(v);
    if (v === 'note') {
      setSkill(undefined);
      setDate('');
      setRecurrence('');
      setCompletedAt('');
    }
    saveProp('status', v);
  };
  const handleDate       = (v: string) => { setDate(v);   saveProp('date', v); };
  const handleRecurrence = (v: string) => { setRecurrence(v); saveProp('recurrence', v); };
  const handleSkill      = (v: NoteSkill | undefined) => { setSkill(v); saveProp('skill', v); };

  // ── Touch gestures: swipe-to-reply + long-press context menu ───────
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const isSwiping = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();

  // Cleanup long-press timer if component unmounts mid-touch
  React.useEffect(() => {
    return () => clearTimeout(longPressTimer.current);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
    longPressTimer.current = setTimeout(() => {
      openContextMenuAt?.(e.touches[0].clientX, e.touches[0].clientY, note.id);
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      clearTimeout(longPressTimer.current);
    }
    if (Math.abs(dx) > Math.abs(dy) && dx < 0) {
      isSwiping.current = true;
      e.stopPropagation();
      setSwipeOffset(Math.max(-72, dx));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    clearTimeout(longPressTimer.current);
    if (isSwiping.current) {
      e.stopPropagation(); // prevent App's tab-swipe handler from firing
      if (swipeOffset < -48) onStartReply?.(note.id);
    }
    isSwiping.current = false;
    setSwipeOffset(0);
  };

  const isDragOverChild   = dragOverInfo?.id === note.id && dragOverInfo?.zone === 'child';
  const isDragOverSibling = dragOverInfo?.id === note.id && dragOverInfo?.zone === 'sibling';

  let baseBg = 'transparent';
  if (status === 'done')      baseBg = 'rgba(34, 197, 94, 0.06)';
  else if (status === 'todo') baseBg = 'rgba(239, 68, 68, 0.06)';
  else if (status === 'doing') baseBg = 'rgba(96, 149, 237, 0.09)';
  else if (status === 'archived') baseBg = 'var(--bg-hover)';

  let finalBg = isReplying ? 'var(--accent-bg)' : baseBg;

  // Task chips (date, skill, recurrence) are hidden when status is 'note'
  const showTaskChips = status !== 'note';

  return (
    <div
      key={virtualItem.key}
      data-index={virtualItem.index}
      data-note-id={note.id}
      ref={virtualizer.measureElement}
      onDragOver={(e) => onDragOver(e, note.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, note.id)}
      onDragEnd={onDragEnd}
      className="note-card"
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%',
        transform: `translateY(${virtualItem.start}px)`,
        padding: '2px 6px',
        opacity: draggedId === note.id ? 0.3 : 1,
      }}
    >
      {/* Vertical connector line for nested notes */}
      {note.depth > 0 && (
        <div style={{
          position: 'absolute',
          left: `calc(6px + ${indent - 10}px)`,
          top: 0, bottom: 0,
          width: '1px', background: 'var(--line)',
          pointerEvents: 'none',
        }} />
      )}

      {/* ── Card panel with swipe wrapper ── */}
      <div style={{ marginLeft: `${indent}px`, position: 'relative' }}>
        {/* Swipe-to-reply hint (revealed behind card on left swipe) */}
        <div className={`swipe-reply-hint${swipeOffset < -20 ? ' visible' : ''}`}>
          ↩ Ответить
        </div>

      <div
        className={`note-card-swipeable note-card-inner${isSwiping.current ? ' swiping' : ''}`}
        data-status={status}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { clearTimeout(longPressTimer.current); isSwiping.current = false; setSwipeOffset(0); }}
        style={{
          background: finalBg !== 'transparent' ? finalBg : 'var(--card-bg)',
          border: (isDragOverSibling || isDragOverChild)
            ? '1px solid var(--accent)'
            : '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px 40px 8px 16px',
          position: 'relative',
          overflow: 'hidden',
          transition: swipeOffset !== 0 ? 'none' : 'border-color 0.12s, background 0.12s, transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)',
          transform: swipeOffset !== 0 ? `translateX(${swipeOffset}px)` : 'none',
        }}>

        {/* Drag handle — top-right corner, same element for desktop drag
            and mobile touch-drag. Hidden while the card is being edited. */}
        {editingNoteId !== note.id && (
          <div
            className="drag-handle"
            draggable
            onDragStart={(e) => onDragStart(e, note.id)}
            onTouchStart={onTouchDragStart ? (e) => {
              e.stopPropagation();
              onTouchDragStart(note.id, e.touches[0]);
            } : undefined}
            style={{
              opacity: draggedId === note.id ? 1 : undefined,
              color: draggedId === note.id ? 'var(--accent)' : undefined,
            }}
            aria-label="Перетащить"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <circle cx="4" cy="3" r="1.2"/><circle cx="10" cy="3" r="1.2"/>
              <circle cx="4" cy="7" r="1.2"/><circle cx="10" cy="7" r="1.2"/>
              <circle cx="4" cy="11" r="1.2"/><circle cx="10" cy="11" r="1.2"/>
            </svg>
          </div>
        )}

        {/* DnD indicators */}
        {draggedId && draggedId !== note.id && (isDragOverSibling || isDragOverChild) && (
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10,
            borderRadius: 'inherit',
            border: isDragOverChild ? '2px solid var(--accent)' : 'none',
            background: isDragOverChild ? 'rgba(55, 53, 47, 0.03)' : 'transparent'
          }}>
            {isDragOverSibling && (
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: 'var(--accent)', borderRadius: '4px 0 0 4px' }} />
            )}
          </div>
        )}

        {/* ── Card body ── */}
        <div style={{ position: 'relative', zIndex: 2 }} onContextMenu={(e) => openContextMenu(e, note.id)}>


          {/* CONTENT */}
          {editingNoteId === note.id ? (
            <div onClick={(e: any) => e.stopPropagation()}>
              <TweetEditor
                initialAst={note.content} initialPropsStr={note.properties}
                placeholder="Редактировать..." buttonText="Сохранить"
                onCancel={() => onCancelEdit && onCancelEdit()}
                onSubmit={(ast, propsJson) => { if (onSubmitEdit) onSubmitEdit(note.id, ast, propsJson); }}
                onExpand={() => onExpandNote?.(note.id)}
                autoFocus
              />
            </div>
          ) : (
            <>
              <div className="note-content">
                <TiptapRender
                  astString={note.content}
                  onUpdateAST={(newAst) => db.exec(`UPDATE notes SET content = ? WHERE id = ?`, [encrypt(newAst), note.id])}
                />
              </div>

              {collapsedChildCount > 0 && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  marginTop: '6px', padding: '2px 8px',
                  fontSize: '0.72rem', fontFamily: 'var(--font-mono)',
                  color: 'var(--text-faint)',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer', userSelect: 'none',
                }}
                  onClick={e => { e.stopPropagation(); openContextMenu(e, note.id); }}
                >
                  ↳ {collapsedChildCount}
                </div>
              )}

              {/* ── Footer: props + timestamp + pin ── */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onDragStart={e => e.stopPropagation()}
              >
                <PropChip value={status} options={STATUSES} onChange={handleStatus} />
                {showTaskChips && recurrence !== '' && !Number.isNaN(parseInt(recurrence)) && (
                  <RecurrenceChip value={recurrence} onChange={handleRecurrence} />
                )}
                {showTaskChips && targetDate && (
                  <DateChip value={targetDate} onChange={handleDate} />
                )}
                {showTaskChips && status === 'done' && completedAt && (
                  <CompletionDateChip value={completedAt} />
                )}
                {showTaskChips && skill && (
                  <SkillChip value={skill} onChange={handleSkill} existingNames={getAllSkillNames()} onCopyChip={onCopyChip} />
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {backlinks.length > 0 && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setBacklinksOpen(o => !o); }}
                      title={backlinksOpen ? 'Скрыть упоминания' : `Упомянуто в ${backlinks.length}`}
                      style={{
                        ...CHIP_BASE,
                        ...(backlinksOpen ? {
                          color: '#93c5fd',
                          background: 'rgba(147, 197, 253, 0.10)',
                          borderColor: 'rgba(147, 197, 253, 0.30)',
                        } : {}),
                      }}
                    >
                      <IconReply size={11} />
                      <span>{backlinks.length}</span>
                    </button>
                  )}
                  {!!note.is_pinned && (
                    <span style={{ color: 'var(--text-faint)', opacity: 0.6, display: 'flex' }}><IconPin size={11} /></span>
                  )}
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                    {formatNoteDate(note.created_at)}
                  </span>
                </div>
              </div>

              {/* Linked references — sits at the bottom of this card, above
                  any child threads which render as sibling cards below. */}
              {backlinks.length > 0 && backlinksOpen && (
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    marginTop: '10px', paddingTop: '8px',
                    borderTop: '1px dashed var(--line)',
                    display: 'flex', flexDirection: 'column', gap: '4px',
                  }}
                >
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '2px' }}>
                    Упомянуто в {backlinks.length}
                  </div>
                  {backlinks.map(b => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onNoteClick?.(b.id); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        textAlign: 'left',
                        background: 'transparent',
                        border: '1px solid var(--line)',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        color: 'var(--text-sub)',
                        fontSize: '0.78rem',
                        fontFamily: 'var(--font-body)',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        transition: 'background 0.1s, border-color 0.1s, color 0.1s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'var(--bg-hover)';
                        e.currentTarget.style.color = 'var(--text)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--text-sub)';
                      }}
                    >
                      <IconReply size={11} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.snippet || '(без текста)'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Reply form */}
        {isReplying && (
          <div style={{ marginTop: '0.75rem' }}>
            <TweetEditor
              placeholder="Напиши ответ..." buttonText="Отправить"
              onCancel={() => onCancelReply && onCancelReply()}
              onSubmit={(ast, propsJson) => { if (onSubmitReply) onSubmitReply(note.id, ast, propsJson); }}
              onExpand={() => onExpandNote?.(note.id)}
              autoFocus
            />
          </div>
        )}
      </div>
      </div>{/* end swipe wrapper */}

    </div>
  );
}, (prev, next) => {
  // Custom comparator. Function props are intentionally excluded — they
  // are stabilized with useCallback in Feed.tsx.
  //
  // editingNoteId/draggedId/dragOverInfo are scoped to "did this card's
  // own state change?" so dragging or editing one card doesn't re-render
  // every other card in a 3000-note feed.
  const id = next.note.id;
  const prevHover = prev.dragOverInfo && prev.dragOverInfo.id === id ? prev.dragOverInfo.zone : null;
  const nextHover = next.dragOverInfo && next.dragOverInfo.id === id ? next.dragOverInfo.zone : null;
  return (
    prev.note.id === id &&
    prev.note.updated_at === next.note.updated_at &&
    prev.note.properties === next.note.properties &&
    prev.note.content === next.note.content &&
    prev.note.is_pinned === next.note.is_pinned &&
    prev.note.parent_id === next.note.parent_id &&
    prev.note.sort_key === next.note.sort_key &&
    prev.indent === next.indent &&
    prev.isReplying === next.isReplying &&
    (prev.editingNoteId === id) === (next.editingNoteId === id) &&
    (prev.draggedId === id) === (next.draggedId === id) &&
    prevHover === nextHover &&
    prev.virtualItem.index === next.virtualItem.index &&
    prev.virtualItem.start === next.virtualItem.start &&
    prev.isSharedFeed === next.isSharedFeed &&
    prev.localNpub === next.localNpub &&
    prev.collapsedChildCount === next.collapsedChildCount &&
    prev.backlinks === next.backlinks &&
    prev.defaultBacklinksOpen === next.defaultBacklinksOpen
  );
});
