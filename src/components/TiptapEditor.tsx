import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { createPortal } from 'react-dom';
import type { NodeViewProps } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlock from '@tiptap/extension-code-block';
import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { saveToOpfs, resolveUrl, getFileType, formatSize } from '../utils/opfsFiles';
import '../editorTheme.css';

// ─── Image Lightbox ───────────────────────────────────────────────────
const Lightbox = ({ url, name, onClose }: { url: string; name: string; onClose: () => void }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      <img
        src={url}
        alt={name}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '95vw', maxHeight: '95vh',
          borderRadius: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          cursor: 'default', objectFit: 'contain',
        }}
      />
      <button
        onClick={onClose}
        style={{
          position: 'fixed', top: '24px', right: '24px',
          background: 'rgba(255,255,255,0.2)', border: 'none',
          color: 'white', fontSize: '24px', width: '44px', height: '44px',
          borderRadius: '50%', cursor: 'pointer', lineHeight: '44px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >✕</button>
    </div>,
    document.body
  );
};

// ─── 3-State TaskItem Extension ───────────────────────────────────────
// Extends the default TaskItem to support 3 states: unchecked → done → cancelled
const ThreeStateTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      state: {
        default: 'unchecked',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-state') || 'unchecked',
        renderHTML: (attributes: any) => ({ 'data-state': attributes.state }),
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const state = node.attrs.state || 'unchecked';
    const checked = state !== 'unchecked';
    return [
      'li',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'taskItem',
        'data-state': state,
        'data-checked': checked ? 'true' : 'false',
      }),
      ['label', { contenteditable: 'false' },
        ['span', {
          class: 'tsc-box',
          'data-state': state,
        }],
      ],
      ['div', { class: 'task-item-content' }, 0],
    ];
  },

  addNodeView() {
    return ({ node, HTMLAttributes, getPos, editor }) => {
      const li = document.createElement('li');
      Object.entries(mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)).forEach(([key, value]) => {
        if (value !== undefined && value !== null) li.setAttribute(key, value as string);
      });
      li.setAttribute('data-type', 'taskItem');

      const state = node.attrs.state || 'unchecked';
      li.setAttribute('data-state', state);
      li.setAttribute('data-checked', state !== 'unchecked' ? 'true' : 'false');

      const label = document.createElement('label');
      label.contentEditable = 'false';

      const box = document.createElement('span');
      box.className = 'tsc-box';
      box.dataset.state = state;
      box.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof getPos !== 'function') return;
        const pos = getPos() as number;
        if (pos == null) return;
        const currentState = box.dataset.state || 'unchecked';
        let nextState: string;
        if (currentState === 'unchecked') nextState = 'done';
        else if (currentState === 'done') nextState = 'cancelled';
        else nextState = 'unchecked';

        editor.chain().focus().command(({ tr, state: editorState }) => {
          const currentNode = editorState.doc.nodeAt(pos);
          if (!currentNode) return false;
          tr.setNodeMarkup(pos, undefined, {
            ...currentNode.attrs,
            checked: nextState !== 'unchecked',
            state: nextState,
          });
          return true;
        }).run();
      });

      label.appendChild(box);
      li.appendChild(label);

      const content = document.createElement('div');
      content.className = 'task-item-content';
      li.appendChild(content);

      return {
        dom: li,
        contentDOM: content,
        update: (updatedNode: any) => {
          if (updatedNode.type.name !== 'taskItem') return false;
          const newState = updatedNode.attrs.state || 'unchecked';
          li.setAttribute('data-state', newState);
          li.setAttribute('data-checked', newState !== 'unchecked' ? 'true' : 'false');
          box.dataset.state = newState;
          return true;
        },
      };
    };
  },
});

// ─── Attachment NodeView ──────────────────────────────────────────────
const AttachmentNodeView = ({ node, deleteNode, selected }: NodeViewProps) => {
  const { src, name, fileType, size } = node.attrs;
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    resolveUrl(src).then(setUrl).catch(() => setError(true));
  }, [src]);

  const containerStyle: React.CSSProperties = {
    position: 'relative', display: 'block', margin: '0.5em 0',
    outline: selected ? '2px solid #3b82f6' : 'none', borderRadius: '8px',
  };

  const deleteBtn = (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); deleteNode(); }}
      style={{
        position: 'absolute', top: '6px', right: '6px', zIndex: 10,
        background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white',
        borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontSize: '0.75rem',
      }}
    >✕</button>
  );

  if (error) return (
    <NodeViewWrapper>
      <div style={{ ...containerStyle, padding: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', fontSize: '0.8rem', color: '#f87171' }}>
        ⚠ Файл не найден: {name}
        {deleteBtn}
      </div>
    </NodeViewWrapper>
  );

  if (!url) return (
    <NodeViewWrapper>
      <div style={{ ...containerStyle, padding: '8px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>⏳ {name}</div>
    </NodeViewWrapper>
  );

  if (fileType === 'image') return (
    <NodeViewWrapper className="attachment-node-img">
      <div style={containerStyle}>
        <img
          src={url} alt={name}
          onClick={() => setLightbox(true)}
          style={{ width: '100%', height: '130px', objectFit: 'cover', borderRadius: '6px', display: 'block', cursor: 'zoom-in' }}
          onError={() => setError(true)}
        />
        {deleteBtn}
        {lightbox && <Lightbox url={url} name={name} onClose={() => setLightbox(false)} />}
      </div>
    </NodeViewWrapper>
  );

  if (fileType === 'video') return (
    <NodeViewWrapper>
      <div style={containerStyle}>
        <video src={url} controls style={{ maxWidth: '100%', borderRadius: '8px', display: 'block' }} />
        {deleteBtn}
      </div>
    </NodeViewWrapper>
  );

  return (
    <NodeViewWrapper>
      <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}>
        <span style={{ fontSize: '1.4rem' }}>📎</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.85rem', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatSize(size)}</div>
        </div>
        <a href={url} download={name} style={{ background: 'var(--accent)', color: 'white', borderRadius: '4px', padding: '3px 10px', fontSize: '0.75rem', textDecoration: 'none' }}>↓</a>
        {deleteBtn}
      </div>
    </NodeViewWrapper>
  );
};

// ─── Attachment TipTap Extension ──────────────────────────────────────
const AttachmentExtension = Node.create({
  name: 'attachment',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      name: { default: '' },
      size: { default: 0 },
      fileType: { default: 'file' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="attachment"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'attachment' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentNodeView as any);
  },
});

// ─── Backlink Suggestion Plugin (manual implementation) ───────────────
const backlinkPluginKey = new PluginKey('backlink');

function createBacklinkPlugin(
  onActivate: (query: string, pos: { from: number; to: number }) => void,
  onDeactivate: () => void,
) {
  return new Plugin({
    key: backlinkPluginKey,
    state: {
      init: () => ({ active: false, query: '', from: 0, to: 0 }),
      apply(tr, prev) {
        const meta = tr.getMeta(backlinkPluginKey);
        if (meta) return meta;
        if (!prev.active) return prev;
        // If selection changed, re-check
        const { $head } = tr.selection;
        const textBefore = $head.parent.textContent.slice(0, $head.parentOffset);
        const match = /\[\[([^\]]*)$/.exec(textBefore);
        if (match) {
          return { active: true, query: match[1], from: $head.pos - match[1].length - 2, to: $head.pos };
        }
        return { active: false, query: '', from: 0, to: 0 };
      },
    },
    props: {
      handleTextInput(view, from, to, text) {
        const { state } = view;
        const $head = state.selection.$head;
        const textBefore = $head.parent.textContent.slice(0, $head.parentOffset) + text;
        const match = /\[\[([^\]]*)$/.exec(textBefore);
        if (match) {
          setTimeout(() => {
            onActivate(match[1], { from: from - match[1].length - 1, to: to + text.length });
          }, 0);
        } else {
          onDeactivate();
        }
        return false;
      },
      handleKeyDown(view, event) {
        const pluginState = backlinkPluginKey.getState(view.state);
        if (pluginState?.active && event.key === 'Escape') {
          onDeactivate();
          return true;
        }
        return false;
      },
    },
  });
}

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
    background: 'rgba(255,255,255,0.05)', color: '#93c5fd',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px',
    fontSize: '0.8rem', padding: '4px 6px', cursor: 'pointer',
  };
  const optStyle: React.CSSProperties = { backgroundColor: '#1e293b', color: '#e2e8f0' };

  return (
    <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', background: 'var(--card-bg)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: 'var(--text-main)' }}>
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
        marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)',
      }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={selStyle}>
          {TYPES.map(s => <option key={s} value={s} style={optStyle}>{s}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...selStyle, color: '#dcfce7' }}>
          {STATUSES.map(s => <option key={s} value={s} style={optStyle}>{s}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...selStyle, color: 'white', colorScheme: 'dark' }} />

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {uploadProgress && <UploadRing done={uploadProgress.done} total={uploadProgress.total} />}
          {onCancel && (
            <button type="button" onClick={onCancel} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer' }}>Отмена</button>
          )}
          <button type="button" onClick={handleSubmit} disabled={!!uploadProgress} style={{ background: 'var(--accent)', border: 'none', color: 'white', padding: '6px 20px', borderRadius: '6px', cursor: uploadProgress ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: uploadProgress ? 0.6 : 1 }}>{buttonText}</button>
        </div>
      </div>
    </div>
  );
};

// ─── Attachment display for read-only render ──────────────────────────
const AttachmentDisplay = ({ src, name, fileType, size, inGrid }: { src: string; name: string; fileType: string; size: number; inGrid?: boolean }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  useEffect(() => { resolveUrl(src).then(setUrl).catch(() => setError(true)); }, [src]);

  if (error) return <div style={{ color: '#f87171', fontSize: '0.8rem', margin: '0.25em 0' }}>⚠ {name}</div>;
  if (!url) return <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>⏳ {name}</div>;

  if (fileType === 'image') return (
    <div style={{ display: 'contents' }} onClick={e => e.stopPropagation()}>
      <img
        src={url} alt={name}
        onClick={() => setLightbox(true)}
        onError={() => setError(true)}
        style={{
          width: '100%',
          height: inGrid ? '130px' : 'auto',
          maxHeight: inGrid ? '130px' : '320px',
          objectFit: 'cover',
          borderRadius: '8px',
          display: 'block',
          cursor: 'zoom-in',
          margin: inGrid ? 0 : '0.5rem 0',
          background: 'rgba(255,255,255,0.03)',
        }}
      />
      {lightbox && <Lightbox url={url} name={name} onClose={() => setLightbox(false)} />}
    </div>
  );

  if (fileType === 'video') return <video src={url} controls style={{ maxWidth: '100%', maxHeight: '360px', borderRadius: '8px', margin: '0.5em 0', display: 'block' }} />;

  return (
    <a href={url} download={name} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#e2e8f0', textDecoration: 'none', fontSize: '0.85rem', margin: '0.5em 0' }}>
      📎 {name} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({formatSize(size)})</span>
    </a>
  );
};

// ─── TipTap Read-only Renderer ────────────────────────────────────────
// Renders TipTap JSON (doc format) into React elements without a full editor.

const renderTiptapNode = (node: any, index: number, onUpdateAST?: (ast: string) => void, docJson?: any): React.ReactNode => {
  if (!node) return null;
  const ch = () => (node.content || []).map((c: any, i: number) => renderTiptapNode(c, i, onUpdateAST, docJson));

  if (node.type === 'text') {
    const marks: string[] = (node.marks || []).map((m: any) => m.type);
    const linkMark = (node.marks || []).find((m: any) => m.type === 'link');
    let el: React.ReactNode = node.text;
    if (marks.includes('bold')) el = <strong>{el}</strong>;
    if (marks.includes('italic')) el = <em>{el}</em>;
    if (marks.includes('strike')) el = <s style={{ textDecoration: 'line-through' }}>{el}</s>;
    if (marks.includes('underline')) el = <u>{el}</u>;
    if (marks.includes('code')) el = <code style={{ background: '#2d3748', padding: '2px 4px', borderRadius: '4px', fontSize: '0.88em' }}>{el}</code>;
    if (linkMark) {
      const href: string = linkMark.attrs?.href || '';
      const isInternal = href.startsWith('note://');
      const id = isInternal ? href.replace('note://', '') : null;
      el = (
        <a
          href={isInternal ? '#' : href}
          onClick={(e) => { if (isInternal) { e.preventDefault(); e.stopPropagation(); (window as any).scrollToNote?.(id); } }}
          style={{ color: isInternal ? '#93c5fd' : 'var(--accent)', textDecoration: 'underline', background: isInternal ? 'rgba(147,197,253,0.1)' : 'transparent', padding: isInternal ? '2px 4px' : '0', borderRadius: isInternal ? '4px' : '0', fontWeight: isInternal ? 'bold' : 'normal' }}
        >
          {isInternal && '🔗 '}{node.text?.replace(/^\[\[/, '').replace(/\]\]$/, '')}
        </a>
      );
    }
    return <React.Fragment key={index}>{el}</React.Fragment>;
  }

  if (node.type === 'paragraph') {
    const align = node.attrs?.textAlign || 'left';
    return <p key={index} style={{ margin: '0 0 0.5em', textAlign: align }}>{ch()}</p>;
  }

  if (node.type === 'heading') {
    const level = node.attrs?.level || 2;
    const Tag = `h${level}` as any;
    const fSize = level === 1 ? '1.6rem' : level === 2 ? '1.4rem' : '1.2rem';
    return <Tag key={index} style={{ fontSize: fSize, marginTop: '0.8em', marginBottom: '0.4em', fontWeight: 'bold', lineHeight: 1.2 }}>{ch()}</Tag>;
  }

  if (node.type === 'bulletList') {
    return <ul key={index} style={{ margin: '0.5em 0', paddingLeft: '20px' }}>{ch()}</ul>;
  }
  if (node.type === 'orderedList') {
    return <ol key={index} style={{ margin: '0.5em 0', paddingLeft: '20px' }}>{ch()}</ol>;
  }
  if (node.type === 'listItem') {
    return <li key={index}>{ch()}</li>;
  }

  if (node.type === 'taskList') {
    return <ul key={index} style={{ margin: '0.5em 0', paddingLeft: '0', listStyle: 'none' }}>{ch()}</ul>;
  }

  if (node.type === 'taskItem') {
    const state = node.attrs?.state || (node.attrs?.checked ? 'done' : 'unchecked');
    const isDone = state === 'done';
    const isCancelled = state === 'cancelled';
    return (
      <li key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (!onUpdateAST || !docJson) return;
            const next = state === 'unchecked' ? 'done' : state === 'done' ? 'cancelled' : 'unchecked';
            node.attrs = { ...node.attrs, state: next, checked: next !== 'unchecked' };
            onUpdateAST(JSON.stringify(docJson));
          }}
          style={{
            marginTop: '0.2rem', width: '24px', height: '24px', flexShrink: 0,
            border: '2px solid',
            borderColor: isDone ? '#4ade80' : isCancelled ? '#f87171' : '#a78bfa',
            background: isDone ? '#4ade80' : isCancelled ? '#f87171' : 'rgba(0,0,0,0.5)',
            borderRadius: '4px', cursor: onUpdateAST ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s all',
          }}
        >
          {isDone && <span style={{ color: 'black', fontSize: '14px', fontWeight: 'bold', lineHeight: 1, pointerEvents: 'none' }}>✓</span>}
          {isCancelled && <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold', lineHeight: 1, pointerEvents: 'none' }}>✕</span>}
        </div>
        <span style={{ textDecoration: isCancelled ? 'line-through' : 'none', color: isDone ? '#4ade80' : isCancelled ? '#718096' : 'inherit', transition: '0.2s', opacity: isCancelled ? 0.6 : 1, marginTop: '0.1rem' }}>
          {ch()}
        </span>
      </li>
    );
  }

  if (node.type === 'blockquote') {
    return <blockquote key={index} style={{ borderLeft: '3px solid var(--accent)', paddingLeft: '10px', margin: '0.5em 0', color: '#a0aec0' }}>{ch()}</blockquote>;
  }

  if (node.type === 'codeBlock') {
    const code = (node.content || []).map((c: any) => c.text ?? '').join('');
    return <pre key={index} style={{ background: '#1a202c', padding: '12px', borderRadius: '8px', border: '1px solid #2d3748', overflowX: 'auto', margin: '0.5em 0' }}><code style={{ fontFamily: 'monospace', color: '#e2e8f0' }}>{code}</code></pre>;
  }

  if (node.type === 'hardBreak') return <br key={index} />;

  if (node.type === 'attachment') {
    const { src, name, fileType, size } = node.attrs || {};
    const ft = fileType || getFileType(src || '');
    return <AttachmentDisplay key={index} src={src || ''} name={name || ''} fileType={ft} size={size || 0} />;
  }

  return <React.Fragment key={index}>{ch()}</React.Fragment>;
};

export const TiptapRender = ({ astString, onUpdateAST }: { astString: string; onUpdateAST?: (ast: string) => void }) => {
  if (!astString) return null;

  let doc: any = null;
  try { doc = JSON.parse(astString); } catch { return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{astString}</div>; }

  if (!doc) return null;

  // Support both TipTap doc format {type:'doc', content:[...]} and bare content arrays
  const nodes: any[] = doc.type === 'doc' ? (doc.content || []) : (doc.content || doc.children || []);

  // Group consecutive attachment nodes into image grids
  const grouped: Array<{ type: 'single'; node: any; idx: number } | { type: 'grid'; nodes: any[]; startIdx: number }> = [];
  let batch: any[] = [];
  let batchStart = 0;
  nodes.forEach((child: any, i: number) => {
    if (child.type === 'attachment') {
      if (batch.length === 0) batchStart = i;
      batch.push(child);
    } else {
      if (batch.length > 0) { grouped.push({ type: 'grid', nodes: batch, startIdx: batchStart }); batch = []; }
      grouped.push({ type: 'single', node: child, idx: i });
    }
  });
  if (batch.length > 0) grouped.push({ type: 'grid', nodes: batch, startIdx: batchStart });

  return (
    <div className="tiptap-content" style={{ pointerEvents: 'auto', wordBreak: 'break-word' }}>
      {grouped.map((item) => {
        if (item.type === 'grid') {
          return (
            <div key={`grid-${item.startIdx}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '6px', margin: '0.5em 0' }}>
              {item.nodes.map((node, j) => {
                const { src, name, fileType, size } = node.attrs || {};
                const ft = fileType || getFileType(src || '');
                return <AttachmentDisplay key={j} src={src || ''} name={name || ''} fileType={ft} size={size || 0} inGrid />;
              })}
            </div>
          );
        }
        return renderTiptapNode(item.node, item.idx, onUpdateAST, doc);
      })}
    </div>
  );
};
