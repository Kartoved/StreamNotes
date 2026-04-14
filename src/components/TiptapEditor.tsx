import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlock from '@tiptap/extension-code-block';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { saveToOpfs, getFileType } from '../utils/opfsFiles';
import '../editorTheme.css';

import { ThreeStateTaskItem } from '../editor/extensions/ThreeStateTaskItem';
import { AttachmentExtension } from '../editor/extensions/Attachment';
import { BacklinkDropdown } from './BacklinkDropdown';
import { createBacklinkExtension, BacklinkSuggestionCallbacks } from '../editor/extensions/BacklinkExtension';
import { useDB } from '../db/DBContext';
import { useCrypto } from '../crypto/CryptoContext';

// ─── SVG Icon primitives ──────────────────────────────────────────────
const Ic = ({ d, size = 15 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'block', pointerEvents: 'none' }}>
    <path d={d} />
  </svg>
);

// ─── Toolbar Component ────────────────────────────────────────────────
function Toolbar({
    editor, onUpload, onExpand, zenMode, onCancel,
    onInsertBacklink,
}: {
    editor: any; onUpload: (files: FileList | File[]) => void; onExpand?: (ast: string) => void;
    zenMode?: boolean; onCancel?: () => void;
    onInsertBacklink?: () => void;
}) {
  if (!editor) return null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [linkPopup, setLinkPopup] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState('');

  const btn: React.CSSProperties = {
    background: 'none', border: 'none',
    color: 'var(--text-faint)',
    borderRadius: 'var(--radius)',
    padding: '4px 5px',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'color 0.12s, background 0.12s',
    lineHeight: 1,
  };
  const btnHover = (e: React.MouseEvent<HTMLButtonElement>, enter: boolean) => {
    (e.currentTarget as HTMLButtonElement).style.color = enter ? 'var(--text)' : 'var(--text-faint)';
    (e.currentTarget as HTMLButtonElement).style.background = enter ? 'var(--bg-hover)' : 'transparent';
  };
  const activeStyle: React.CSSProperties = { ...btn, color: 'var(--text)', background: 'var(--bg-active)' };

  // Text-label buttons (B I U S H2 </>) keep font styling
  const textBtn = (extra?: React.CSSProperties): React.CSSProperties => ({
    ...btn,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.78rem',
    fontWeight: 600,
    letterSpacing: '0',
    ...extra,
  });
  const textActive = (extra?: React.CSSProperties): React.CSSProperties => ({
    ...activeStyle,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.78rem',
    fontWeight: 600,
    letterSpacing: '0',
    ...extra,
  });

  const gap = <div style={{ width: '1px', height: '14px', background: 'var(--line)', margin: '0 4px', alignSelf: 'center', flexShrink: 0 }} />;

  const applyLink = () => {
    if (linkUrl) {
      const href = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
      if (editor.state.selection.empty) {
        editor.chain().focus().insertContent({
          type: 'text',
          text: linkUrl,
          marks: [{ type: 'link', attrs: { href } }]
        }).run();
      } else {
        editor.chain().focus().setLink({ href }).run();
      }
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setLinkPopup(false);
    setLinkUrl('');
  };

  return (
    <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: '1px', alignItems: 'center', flexWrap: 'nowrap', overflowX: 'auto' }}>

        {/* ── Format ── */}
        <button type="button" title="Жирный"
          style={editor.isActive('bold') ? textActive({ fontWeight: 700 }) : textBtn({ fontWeight: 700 })}
          onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}
          onClick={() => editor.chain().focus().toggleBold().run()}>B</button>

        <button type="button" title="Курсив"
          style={editor.isActive('italic') ? textActive({ fontStyle: 'italic' }) : textBtn({ fontStyle: 'italic' })}
          onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}
          onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>

        <button type="button" title="Подчёркнутый"
          style={editor.isActive('underline') ? textActive({ textDecoration: 'underline' }) : textBtn({ textDecoration: 'underline' })}
          onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}
          onClick={() => editor.chain().focus().toggleUnderline().run()}>U</button>

        <button type="button" title="Зачёркнутый"
          style={editor.isActive('strike') ? textActive({ textDecoration: 'line-through' }) : textBtn({ textDecoration: 'line-through' })}
          onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}
          onClick={() => editor.chain().focus().toggleStrike().run()}>S</button>

        {gap}

        {/* ── Structure ── */}
        <button type="button" title="Заголовок H2"
          style={editor.isActive('heading', { level: 2 }) ? textActive() : textBtn()}
          onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>

        <button type="button" title="Блок кода"
          style={editor.isActive('codeBlock') ? textActive() : textBtn()}
          onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}>&lt;/&gt;</button>

        {gap}

        {/* ── Lists — SVG icons ── */}
        <button type="button" title="Маркированный список"
          style={editor.isActive('bulletList') ? activeStyle : btn}
          onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}
          onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <Ic d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
        </button>

        <button type="button" title="Нумерованный список"
          style={editor.isActive('orderedList') ? activeStyle : btn}
          onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <Ic d="M10 6h11M10 12h11M10 18h11M4 6h.01M4 12h.01M4 18h.01" />
        </button>

        <button type="button" title="Чеклист"
          style={editor.isActive('taskList') ? activeStyle : btn}
          onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}
          onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <Ic d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </button>

        {gap}

        {/* ── Links ── */}
        <button type="button" title="Внешняя ссылка"
          style={editor.isActive('link') ? activeStyle : btn}
          onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}
          onClick={() => { setLinkUrl(editor.getAttributes('link').href || ''); setLinkPopup(v => !v); }}>
          <Ic d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
        </button>

        <button type="button" title="Ссылка на шиф [["
          style={btn}
          onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}
          onClick={() => onInsertBacklink?.()}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', pointerEvents: 'none' }}>
            <text x="3" y="17" fontSize="14" fontWeight="700" fill="currentColor" stroke="none" fontFamily="var(--font-mono)">[[</text>
          </svg>
        </button>

        {gap}

        {/* ── Attach + Expand ── */}
        <button type="button" title="Прикрепить файл / изображение / видео"
          style={btn}
          onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}
          onClick={() => fileInputRef.current?.click()}>
          <Ic d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        </button>

        <button type="button" title={zenMode ? "Свернуть заметку (Esc)" : "Раскрыть заметку"}
          style={btn}
          onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}
          onClick={() => {
            if (zenMode && onCancel) {
              onCancel();
            } else {
              onExpand?.(JSON.stringify(editor.getJSON()));
            }
          }}>
          {zenMode ? (
            <Ic d="M4 14h6v6m10-10h-6V4m0 6l7-7M3 21l7-7" />
          ) : (
            <Ic d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          )}
        </button>

        <input ref={fileInputRef} type="file" multiple accept="*/*" style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files?.length) { onUpload(e.target.files); e.target.value = ''; } }} />
      </div>

      {linkPopup && (
        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
          <input
            autoFocus type="text" placeholder="https://..."
            value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyLink(); if (e.key === 'Escape') setLinkPopup(false); }}
            style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: '0.82rem', padding: '3px 8px', outline: 'none', fontFamily: 'var(--font-body)' }}
          />
          <button type="button" onClick={applyLink} style={{ ...btn, color: 'var(--text)', border: '1px solid var(--line)', padding: '3px 10px', borderRadius: 'var(--radius)', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>OK</button>
          <button type="button" onClick={() => setLinkPopup(false)} style={{ ...btn, border: '1px solid var(--line)', padding: '3px 8px', borderRadius: 'var(--radius)', fontSize: '0.82rem' }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Properties Selectors ─────────────────────────────────────────────
const STATUSES = ['none', 'todo', 'doing', 'done', 'archived'];

// ─── hasTextContent helper ────────────────────────────────────────────
const hasTextContent = (json: any): boolean => {
  if (!json) return false;
  const check = (node: any): boolean => {
    if (node.type === 'text' && (node.text || '').trim().length > 0) return true;
    if (node.type === 'attachment' && node.attrs?.src) return true;
    return (node.content || node.children || []).some(check);
  };
  return check(json);
};

// ─── Upload Progress Ring ─────────────────────────────────────────────
const UploadRing = ({ done, total }: { done: number; total: number }) => {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const progress = total > 0 ? done / total : 0;
  const dash = circ * progress;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
      <svg width="34" height="34" viewBox="0 0 34 34" style={{ flexShrink: 0 }}>
        {/* Track */}
        <circle cx="17" cy="17" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
        {/* Progress arc */}
        <circle
          cx="17" cy="17" r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 17 17)"
          style={{ transition: 'stroke-dasharray 0.2s ease' }}
        />
        <text x="17" y="21" textAnchor="middle" fontSize="9" fill="var(--text-muted)">{done}/{total}</text>
      </svg>
    </div>
  );
};

// ─── TweetEditor ──────────────────────────────────────────────────────
export const TweetEditor = ({
  onSubmit,
  onCancel,
  placeholder,
  buttonText = 'Шифнуть',
  initialAst,
  initialPropsStr,
  onExpand,
  zenMode,
  autoFocus,
}: {
  onSubmit: (ast: string, propsJson: string) => void;
  onCancel?: () => void;
  placeholder: string;
  buttonText?: string;
  initialAst?: string;
  initialPropsStr?: string;
  onExpand?: (ast: string, propsJson: string) => void;
  zenMode?: boolean;
  autoFocus?: boolean;
}) => {
  const db = useDB();
  const { encrypt } = useCrypto();

  const [editorKey, setEditorKey] = useState(0);
  const initP = initialPropsStr ? JSON.parse(initialPropsStr) : {};
  const [type, setType] = useState(initP.type || 'sheaf');
  const [status, setStatus] = useState(initP.status || 'none');
  const [date, setDate] = useState(initP.date || '');

  // ── Backlink dropdown state ──
  const [blActive, setBlActive] = useState(false);
  const [blQuery, setBlQuery] = useState<string | null>(null);
  const [blPos, setBlPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Ref holding current suggestion command (set by BacklinkExtension on open)
  const blCommandRef = useRef<((item: { id: string; title: string }) => void) | null>(null);
  // Ref holding BacklinkDropdown's key handler (updated each render by the dropdown)
  const blDropdownKeyRef = useRef<((e: KeyboardEvent) => boolean) | null>(null);
  // Stable ref passed to the extension — updated every render so extension always gets fresh callbacks
  const blCallbacksRef = useRef<BacklinkSuggestionCallbacks>({
    onOpen: () => {}, onUpdate: () => {}, onClose: () => {}, onKeyDown: () => false,
  });
  blCallbacksRef.current = {
    onOpen: ({ query, clientRect, command }) => {
      blCommandRef.current = command;
      setBlActive(true);
      setBlQuery(query);
      const rect = clientRect?.();
      if (rect) setBlPos({ top: rect.bottom + 6, left: rect.left });
    },
    onUpdate: ({ query, clientRect }) => {
      setBlQuery(query);
      const rect = clientRect?.();
      if (rect) setBlPos({ top: rect.bottom + 6, left: rect.left });
    },
    onClose: () => {
      setBlActive(false);
      setBlQuery(null);
      blCommandRef.current = null;
    },
    onKeyDown: (event) => blDropdownKeyRef.current?.(event) ?? false,
  };

  // Extension created once; reads callbacks via stable ref
  const backlinkExt = useMemo(() => createBacklinkExtension(blCallbacksRef), []);



  // Upload ref — stable callback for editorProps (avoids stale closure)
  const uploadFilesRef = useRef<(files: FileList | File[]) => void>(() => {});
  // Submit ref — avoids stale closure in handleKeyDown
  const handleSubmitRef = useRef<() => void>(() => {});
  // Upload progress: { done, total } | null
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

  const initialContent = React.useMemo(() => {
    if (!initialAst) return undefined;
    try { return JSON.parse(initialAst); } catch { return undefined; }
  }, [initialAst]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // We use our own
        bulletList: { HTMLAttributes: { class: 'editor-ul' } },
        orderedList: { HTMLAttributes: { class: 'editor-ol' } },
        listItem: { HTMLAttributes: { class: 'editor-listitem' } },
        heading: { levels: [1, 2, 3] },
        blockquote: {},
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'editor-link' },
        protocols: ['note'],
      }),
      CodeBlock.configure({
        HTMLAttributes: { class: 'editor-code-block' },
      }),
      TaskList.configure({
        HTMLAttributes: { class: 'editor-task-list' },
      }),
      ThreeStateTaskItem.configure({
        nested: true,
      }),
      AttachmentExtension,
      backlinkExt,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: initialContent,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
        style: 'outline: none; min-height: 60px; padding: 4px; font-size: 15px; color: var(--text-main, #e2e8f0); line-height: 1.5;',
        'data-gramm': 'false',
        'data-gramm_editor': 'false',
        'data-enable-grammarly': 'false',
        'data-lpignore': 'true',
        'data-1p-ignore': 'true',
        'data-bwignore': 'true',
        'data-kpm-ignore': 'true',
        'data-dashlane-ignore': 'true',
        spellcheck: 'false',
      },
      handleDrop: (_view, event) => {
        const files = (event as DragEvent).dataTransfer?.files;
        if (files?.length) { event.preventDefault(); uploadFilesRef.current(files); return true; }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = (event as ClipboardEvent).clipboardData?.files;
        if (files?.length) { event.preventDefault(); uploadFilesRef.current(files); return true; }
        return false;
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          handleSubmitRef.current();
          return true;
        }
        return false;
      },
    },
    }, [editorKey, initialAst]);

  const blUid = () => Math.random().toString(36).substring(2, 9);

  // ── Backlink: insert link via Suggestion command ──
  const handleBacklinkSelect = useCallback((id: string, title: string) => {
    blCommandRef.current?.({ id, title });
    setBlActive(false);
    setBlQuery(null);
  }, []);

  // ── Backlink: create new note and insert link ──
  const handleBacklinkCreate = useCallback(async (title: string) => {
    if (!editor) return;
    const noteId = 'note-' + blUid();
    const now = Date.now();
    const content = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: title }] }] });
    const feedRows = await db.execO(`SELECT id FROM feeds LIMIT 1`) as any[];
    const feedId = feedRows[0]?.id || null;
    await db.exec(
      `INSERT INTO notes (id, parent_id, author_id, content, sort_key, properties, feed_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [noteId, null, 'local-user', encrypt(content), now.toString(), encrypt('{"type":"sheaf","status":"none","date":""}'), feedId, now, now]
    );
    handleBacklinkSelect(noteId, title);
  }, [editor, db, encrypt, handleBacklinkSelect]);

  // ── Backlink: toolbar button handler ──
  const handleInsertBacklink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertContent('[[').run();
  }, [editor]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    if (!editor) return;
    const arr = Array.from(files);
    setUploadProgress({ done: 0, total: arr.length });
    const nodes: any[] = [];
    for (let i = 0; i < arr.length; i++) {
      try {
        const src = await saveToOpfs(arr[i]);
        const fileType = getFileType(src);
        nodes.push({ type: 'attachment', attrs: { src, name: arr[i].name, size: arr[i].size, fileType } });
      } catch (e: any) {
        alert(e.message);
      }
      setUploadProgress({ done: i + 1, total: arr.length });
    }
    setUploadProgress(null);
    if (nodes.length > 0) {
      editor.chain().focus().command(({ tr, state, dispatch }) => {
        if (!dispatch) return false;
        let pos = state.selection.to;
        for (const nodeJSON of nodes) {
          const node = state.schema.nodeFromJSON(nodeJSON);
          tr.insert(pos, node);
          pos += node.nodeSize;
        }
        dispatch(tr);
        return true;
      }).run();
    }
  }, [editor]);

  useEffect(() => { uploadFilesRef.current = uploadFiles; }, [uploadFiles]);

  const handleSubmit = useCallback(() => {
    if (!editor) return;
    const json = editor.getJSON();
    if (!hasTextContent(json)) return;

    const propsJson = JSON.stringify({ type, status, date });
    onSubmit(JSON.stringify(json), propsJson);

    if (!initialAst) {
      // Reset editor
      setEditorKey(k => k + 1);
      setType('sheaf');
      setStatus('none');
      setDate('');
    }
  }, [editor, type, status, date, onSubmit, initialAst]);
  useEffect(() => { handleSubmitRef.current = handleSubmit; }, [handleSubmit]);
  
  // ── Escape: cancel reply / close zen ──
  useEffect(() => {
    if (!onCancel) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onCancel]);

  const selStyle: React.CSSProperties = {
    background: 'var(--bg-hover)',
    color: 'var(--text-sub)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius)',
    fontSize: '0.8rem',
    padding: '4px 8px',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  };
  const optStyle: React.CSSProperties = { backgroundColor: 'var(--bg)', color: 'var(--text)' };

  let zenBg = 'var(--bg)';
  if (zenMode) {
    if (status === 'done') zenBg = 'rgba(134, 239, 172, 0.08)';
    else if (status === 'todo') zenBg = 'rgba(239, 68, 68, 0.08)';
    else if (status === 'doing') zenBg = 'rgba(96, 165, 250, 0.08)';
    else if (status === 'archived') zenBg = 'rgba(15, 23, 42, 0.08)';
  }

  return (
    <div style={zenMode ? {
      position: 'fixed', inset: 0, zIndex: 3000,
      background: zenBg,
      color: 'var(--text)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-body)',
      fontSize: '1.1rem',
      lineHeight: 1.8,
      transition: 'background 0.3s ease',
    } : {
      position: 'relative',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-lg)',
      padding: '14px 20px',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'var(--font-body)',
      fontSize: '1rem',
      lineHeight: 1.85,
      letterSpacing: '0.01em',
    }}>
      <div style={zenMode ? { padding: '12px 24px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'center', background: 'transparent' } : {}}>
        <Toolbar
            editor={editor}
            onUpload={(files) => uploadFiles(files)}
            onExpand={onExpand ? (ast) => onExpand(ast, JSON.stringify({ type, status, date })) : undefined}
            zenMode={zenMode}
            onCancel={onCancel}
            onInsertBacklink={handleInsertBacklink}
        />
      </div>

      <div style={zenMode ? { flex: 1, overflowY: 'auto', padding: '60px 40px', maxWidth: '840px', margin: '0 auto', width: '100%', boxSizing: 'border-box' } : { position: 'relative' }}>
        <EditorContent editor={editor} />
      </div>

      {blActive && (
        <BacklinkDropdown
          query={blQuery ?? ''}
          position={blPos}
          onSelect={(note) => handleBacklinkSelect(note.id, note.title)}
          onCreateNew={handleBacklinkCreate}
          onClose={() => { setBlActive(false); setBlQuery(null); }}
          keyHandlerRef={blDropdownKeyRef}
        />
      )}



      <div style={zenMode ? {
        display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center',
        padding: '16px 24px', borderTop: '1px solid var(--line)', background: 'transparent',
      } : {
        display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center',
        marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--line)',
      }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selStyle}>
          {STATUSES.map(s => <option key={s} value={s} style={optStyle}>{s}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...selStyle }} />

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {uploadProgress && <UploadRing done={uploadProgress.done} total={uploadProgress.total} />}
          {onCancel && !zenMode && (
            <button
              type="button"
              onClick={onCancel}
              style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-sub)', padding: '8px 18px', borderRadius: 'var(--radius)', cursor: 'pointer', fontWeight: 500, fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}
            >Отмена</button>
          )}
          <button type="button" onClick={handleSubmit} disabled={!!uploadProgress} style={{ background: 'var(--accent)', border: 'none', color: '#fff', padding: '8px 32px', borderRadius: 'var(--radius)', cursor: uploadProgress ? 'not-allowed' : 'pointer', fontWeight: 600, fontFamily: 'var(--font-body)', fontSize: '0.9rem', opacity: uploadProgress ? 0.6 : 1 }}>{buttonText}</button>
        </div>
      </div>
    </div>
  );
};

