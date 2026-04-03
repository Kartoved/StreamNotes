import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlock from '@tiptap/extension-code-block';
import { saveToOpfs, resolveUrl, getFileType, formatSize } from '../utils/opfsFiles';
import '../editorTheme.css';

import { ThreeStateTaskItem } from '../editor/extensions/ThreeStateTaskItem';
import { AttachmentExtension } from '../editor/extensions/Attachment';
import { createBacklinkPlugin, backlinkPluginKey } from '../editor/extensions/BacklinkPlugin';

// ─── Toolbar Component ────────────────────────────────────────────────
function Toolbar({ editor, onUpload }: { editor: any; onUpload: (files: FileList) => void }) {
  if (!editor) return null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [linkPopup, setLinkPopup] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState('');

  const btn: React.CSSProperties = {
    background: 'none', border: 'none', color: '#94a3b8',
    borderRadius: '4px', padding: '3px 6px', cursor: 'pointer',
    fontSize: '0.85rem', transition: 'color 0.15s, background 0.15s',
  };
  const active: React.CSSProperties = { ...btn, color: '#e2e8f0', background: 'rgba(255,255,255,0.15)' };
  const sep = <div style={{ width: '1px', background: 'var(--border)', margin: '0 2px', alignSelf: 'stretch' }} />;

  const applyLink = () => {
    if (linkUrl) {
      const href = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
      editor.chain().focus().setLink({ href }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setLinkPopup(false);
    setLinkUrl('');
  };

  return (
    <div style={{ marginBottom: '6px', paddingBottom: '6px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '2px' }}>
        <button type="button" title="Жирный" style={editor.isActive('bold') ? active : { ...btn, fontWeight: 'bold' }} onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
        <button type="button" title="Курсив" style={editor.isActive('italic') ? active : { ...btn, fontStyle: 'italic' }} onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>
        <button type="button" title="Подчёркнутый" style={editor.isActive('underline') ? active : { ...btn, textDecoration: 'underline' }} onClick={() => editor.chain().focus().toggleUnderline().run()}>U</button>
        <button type="button" title="Зачёркнутый" style={editor.isActive('strike') ? active : { ...btn, textDecoration: 'line-through' }} onClick={() => editor.chain().focus().toggleStrike().run()}>S</button>
        {sep}
        <button type="button" title="Заголовок H2" style={editor.isActive('heading', { level: 2 }) ? active : btn} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button type="button" title="Блок кода" style={editor.isActive('codeBlock') ? active : btn} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>&lt;/&gt;</button>
        {sep}
        <button type="button" title="Буллет список" style={editor.isActive('bulletList') ? active : btn} onClick={() => editor.chain().focus().toggleBulletList().run()}>•≡</button>
        <button type="button" title="Нумерованный список" style={editor.isActive('orderedList') ? active : btn} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1≡</button>
        <button type="button" title="Чеклист" style={editor.isActive('taskList') ? active : btn} onClick={() => editor.chain().focus().toggleTaskList().run()}>☑</button>
        {sep}
        <button type="button" title="Внешняя ссылка" style={editor.isActive('link') ? active : btn} onClick={() => { setLinkUrl(editor.getAttributes('link').href || ''); setLinkPopup(v => !v); }}>🌐</button>
        <button type="button" title="Бэклинк на заметку" style={btn} onClick={() => editor.chain().focus().insertContent('[[').run()}>🔗</button>
        {sep}
        <button type="button" title="Прикрепить файл / изображение / видео" style={btn} onClick={() => fileInputRef.current?.click()}>📎</button>
        <button type="button" title="Раскрыть заметку" style={{ ...btn, color: 'var(--text-sub)' }} onClick={() => (window as any).onExpandNote?.()}>⛶</button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="*/*"
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files?.length) { onUpload(e.target.files); e.target.value = ''; } }}
        />
      </div>
      {linkPopup && (
        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
          <input
            autoFocus
            type="text"
            placeholder="https://..."
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyLink(); if (e.key === 'Escape') setLinkPopup(false); }}
            style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', color: '#e2e8f0', fontSize: '0.8rem', padding: '3px 7px', outline: 'none' }}
          />
          <button type="button" onClick={applyLink} style={{ ...btn, color: '#60a5fa', padding: '3px 8px' }}>OK</button>
          <button type="button" onClick={() => setLinkPopup(false)} style={{ ...btn, padding: '3px 8px' }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Backlink Dropdown ────────────────────────────────────────────────
function BacklinkDropdown({
  query,
  onSelect,
  onClose,
  editorEl,
}: {
  query: string;
  onSelect: (id: string, title: string) => void;
  onClose: () => void;
  editorEl: HTMLElement | null;
}) {
  const [results, setResults] = useState<{ id: string; title: string }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const db = (window as any).db;

  useEffect(() => {
    if (!db) return;
    db.execO(`SELECT id, content FROM notes LIMIT 50`, [])
      .then((res: any[]) => {
        const extractText = (node: any): string => {
          if (node.type === 'text') return node.text || '';
          return (node.content || []).map((c: any) => extractText(c)).join(' ');
        };
        const filtered = res.map((n: any) => {
          let text = '';
          try { const doc = JSON.parse(n.content); text = extractText(doc).trim(); } catch { text = n.id; }
          return { id: n.id, title: text || n.id };
        }).filter(r => !query || r.title.toLowerCase().includes(query.toLowerCase())).slice(0, 15);
        setResults(filtered.map(r => ({ id: r.id, title: r.title.length > 50 ? r.title.slice(0, 50) + '...' : r.title })));
        setSelectedIndex(0);
      });
  }, [query, db]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter' && results[selectedIndex]) { e.preventDefault(); onSelect(results[selectedIndex].id, results[selectedIndex].title); }
      else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [results, selectedIndex, onSelect, onClose]);

  if (results.length === 0) return null;

  // Position near the caret
  const sel = window.getSelection();
  let top = 0, left = 0;
  if (sel && sel.rangeCount > 0) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    top = rect.bottom + 4;
    left = rect.left;
  }

  return (
    <div style={{
      position: 'fixed', top, left,
      background: '#1e293b', border: '1px solid #475569', borderRadius: '8px',
      zIndex: 10000, color: 'white', minWidth: '280px',
      boxShadow: '0 10px 25px rgba(0,0,0,0.6)', overflow: 'hidden',
    }}>
      {results.map((r, i) => (
        <div
          key={r.id}
          onClick={() => onSelect(r.id, r.title)}
          onMouseEnter={() => setSelectedIndex(i)}
          style={{
            padding: '10px 14px', cursor: 'pointer',
            background: i === selectedIndex ? '#3b82f6' : 'transparent',
            borderBottom: '1px solid rgba(255,255,255,0.05)', transition: '0.1s background',
          }}
        >
          <div style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '2px', fontFamily: 'monospace' }}>{r.id}</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 500, color: i === selectedIndex ? 'white' : '#e2e8f0' }}>{r.title}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Properties Selectors ─────────────────────────────────────────────
const STATUSES = ['none', 'todo', 'doing', 'done', 'archived'];
const TYPES = ['tweet', 'task', 'document'];

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
  buttonText = 'Твитнуть',
  initialAst,
  initialPropsStr,
  autoFocus,
}: {
  onSubmit: (ast: string, propsJson: string) => void;
  onCancel?: () => void;
  placeholder: string;
  buttonText?: string;
  initialAst?: string;
  initialPropsStr?: string;
  autoFocus?: boolean;
}) => {
  const [editorKey, setEditorKey] = useState(0);
  const initP = initialPropsStr ? JSON.parse(initialPropsStr) : {};
  const [type, setType] = useState(initP.type || 'tweet');
  const [status, setStatus] = useState(initP.status || 'none');
  const [date, setDate] = useState(initP.date || '');

  // Backlink state
  const [blQuery, setBlQuery] = useState<string | null>(null);
  const [blActive, setBlActive] = useState(false);

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
        underline: {},
        link: {
          openOnClick: false,
          HTMLAttributes: { class: 'editor-link' },
        },
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
    onUpdate: ({ editor: ed }) => {
      // Check for [[ trigger
      const { $head } = ed.state.selection;
      const textBefore = $head.parent.textContent.slice(0, $head.parentOffset);
      const match = /\[\[([^\]]*)$/.exec(textBefore);
      if (match) {
        setBlQuery(match[1]);
        setBlActive(true);
      } else {
        setBlActive(false);
        setBlQuery(null);
      }
    },
  }, [editorKey, initialAst]);

  const handleBacklinkSelect = useCallback((id: string, title: string) => {
    if (!editor) return;
    // Find the [[ in current text and replace it with a link
    const { $head } = editor.state.selection;
    const textBefore = $head.parent.textContent.slice(0, $head.parentOffset);
    const match = /\[\[([^\]]*)$/.exec(textBefore);
    if (match) {
      const from = $head.pos - match[0].length;
      const to = $head.pos;
      editor.chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent({
          type: 'text',
          marks: [{ type: 'link', attrs: { href: `note://${id}` } }],
          text: `[[${title}]]`,
        })
        .insertContent(' ')
        .run();
    }
    setBlActive(false);
    setBlQuery(null);
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
      setType('tweet');
      setStatus('none');
      setDate('');
    }
  }, [editor, type, status, date, onSubmit, initialAst]);
  useEffect(() => { handleSubmitRef.current = handleSubmit; }, [handleSubmit]);

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

  return (
    <div style={{
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
      <Toolbar editor={editor} onUpload={(files) => uploadFiles(files)} />

      <div style={{ position: 'relative' }}>
        <EditorContent editor={editor} />
      </div>

      {blActive && blQuery !== null && (
        <BacklinkDropdown
          query={blQuery}
          onSelect={handleBacklinkSelect}
          onClose={() => { setBlActive(false); setBlQuery(null); }}
          editorEl={editor?.view?.dom || null}
        />
      )}

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center',
        marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--line)',
      }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={selStyle}>
          {TYPES.map(s => <option key={s} value={s} style={optStyle}>{s}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selStyle}>
          {STATUSES.map(s => <option key={s} value={s} style={optStyle}>{s}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...selStyle }} />

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {uploadProgress && <UploadRing done={uploadProgress.done} total={uploadProgress.total} />}
          {onCancel && (
            <button type="button" onClick={onCancel} style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-sub)', padding: '6px 16px', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>Отмена</button>
          )}
          <button type="button" onClick={handleSubmit} disabled={!!uploadProgress} style={{ background: 'var(--accent)', border: 'none', color: '#fff', padding: '6px 20px', borderRadius: 'var(--radius)', cursor: uploadProgress ? 'not-allowed' : 'pointer', fontWeight: 600, fontFamily: 'var(--font-body)', fontSize: '0.85rem', opacity: uploadProgress ? 0.6 : 1 }}>{buttonText}</button>
        </div>
      </div>
    </div>
  );
};

