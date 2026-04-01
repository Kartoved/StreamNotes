import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlock from '@tiptap/extension-code-block';
import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { lexicalToTiptap, tiptapToLexical } from '../utils/lexicalToTiptap';
import { saveToOpfs, resolveUrl, getFileType, formatSize } from '../utils/opfsFiles';
import '../editorTheme.css';

// ─── Image Lightbox ───────────────────────────────────────────────────
const Lightbox = ({ url, name, onClose }: { url: string; name: string; onClose: () => void }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      <img
        src={url}
        alt={name}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '90vw', maxHeight: '90vh',
          borderRadius: '8px', boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
          cursor: 'default', objectFit: 'contain',
        }}
      />
      <button
        onClick={onClose}
        style={{
          position: 'fixed', top: '16px', right: '20px',
          background: 'rgba(255,255,255,0.15)', border: 'none',
          color: 'white', fontSize: '1.4rem', width: '36px', height: '36px',
          borderRadius: '50%', cursor: 'pointer', lineHeight: 1,
        }}
      >✕</button>
    </div>
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
    <NodeViewWrapper>
      <div style={containerStyle}>
        <img
          src={url} alt={name}
          onClick={() => setLightbox(true)}
          style={{ maxWidth: '100%', maxHeight: '260px', objectFit: 'contain', borderRadius: '8px', display: 'block', cursor: 'zoom-in' }}
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
  const sep = <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 2px', alignSelf: 'stretch' }} />;

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
    <div style={{ marginBottom: '6px', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
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
    db.execO(`SELECT id, content FROM notes WHERE (content LIKE ?) AND (content NOT LIKE '{"root":{"children":[],%') LIMIT 15`, [`%${query}%`])
      .then((res: any[]) => {
        setResults(res.map((n: any) => {
          let text = '';
          try {
            const parsed = JSON.parse(n.content);
            const extractAllText = (node: any): string => {
              if (node.type === 'text') return node.text || '';
              if (node.children) return node.children.map((c: any) => extractAllText(c)).join(' ');
              // TipTap format
              if (node.content) return node.content.map((c: any) => extractAllText(c)).join(' ');
              return '';
            };
            text = extractAllText(parsed.root || parsed).trim();
          } catch {
            text = n.content;
          }
          if (!text) text = n.id;
          if (text.length > 50) text = text.slice(0, 50) + '...';
          return { id: n.id, title: text };
        }));
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

  // Convert initial Lexical AST to TipTap JSON
  const initialContent = React.useMemo(() => {
    if (!initialAst) return undefined;
    const converted = lexicalToTiptap(initialAst);
    return converted || undefined;
  }, [initialAst]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // We use our own
        // taskList/taskItem are separate
        bulletList: { HTMLAttributes: { class: 'editor-ul' } },
        orderedList: { HTMLAttributes: { class: 'editor-ol' } },
        listItem: { HTMLAttributes: { class: 'editor-listitem' } },
        heading: {
          levels: [1, 2, 3],
        },
        blockquote: {},
      }),
      Underline,
      CodeBlock.configure({
        HTMLAttributes: { class: 'editor-code-block' },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'editor-link' },
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
    const nodes: any[] = [];
    for (const file of Array.from(files)) {
      try {
        const src = await saveToOpfs(file);
        const fileType = getFileType(src);
        nodes.push({ type: 'attachment', attrs: { src, name: file.name, size: file.size, fileType } });
      } catch (e: any) {
        alert(e.message);
      }
    }
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

    // Convert TipTap JSON → Lexical AST for DB storage
    const lexicalStr = tiptapToLexical(json);
    const propsJson = JSON.stringify({ type, status, date });
    onSubmit(lexicalStr, propsJson);

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
    <div style={{ position: 'relative', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '8px', padding: '6px 8px', background: 'rgba(0,0,0,0.3)', color: '#fff' }}>
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
        marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)',
      }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={selStyle}>
          {TYPES.map(s => <option key={s} value={s} style={optStyle}>{s}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...selStyle, color: '#dcfce7' }}>
          {STATUSES.map(s => <option key={s} value={s} style={optStyle}>{s}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...selStyle, color: 'white', colorScheme: 'dark' }} />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          {onCancel && (
            <button type="button" onClick={onCancel} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer' }}>Отмена</button>
          )}
          <button type="button" onClick={handleSubmit} style={{ background: 'var(--accent)', border: 'none', color: 'white', padding: '6px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>{buttonText}</button>
        </div>
      </div>
    </div>
  );
};

// ─── Attachment display for read-only render ──────────────────────────
const AttachmentDisplay = ({ src, name, fileType, size }: { src: string; name: string; fileType: string; size: number }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  useEffect(() => { resolveUrl(src).then(setUrl).catch(() => setError(true)); }, [src]);

  if (error) return <div style={{ color: '#f87171', fontSize: '0.8rem', margin: '0.5em 0' }}>⚠ Файл не найден: {name}</div>;
  if (!url) return <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.5em 0' }}>⏳ {name}</div>;

  if (fileType === 'image') return (
    <>
      <img
        src={url} alt={name}
        onClick={() => setLightbox(true)}
        style={{ maxWidth: '100%', maxHeight: '260px', objectFit: 'contain', borderRadius: '8px', margin: '0.5em 0', display: 'block', cursor: 'zoom-in' }}
      />
      {lightbox && <Lightbox url={url} name={name} onClose={() => setLightbox(false)} />}
    </>
  );

  if (fileType === 'video') return <video src={url} controls style={{ maxWidth: '100%', maxHeight: '360px', borderRadius: '8px', margin: '0.5em 0', display: 'block' }} />;

  return (
    <a href={url} download={name} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#e2e8f0', textDecoration: 'none', fontSize: '0.85rem', margin: '0.5em 0' }}>
      📎 {name} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({formatSize(size)})</span>
    </a>
  );
};

// ─── LexicalRender (read-only AST renderer — pure React, no editor) ──
// This was already independent of Lexical's editor runtime.
// It renders Lexical AST JSON into React elements with interactive checkboxes.
const renderNode = (node: any, index: number, rootAst: any, onUpdateAST?: (ast: string) => void): React.ReactNode => {
  if (!node) return null;

  if (node.type === 'text') {
    let el: any = node.text;
    if (node.format & 1) el = <strong key={index}>{el}</strong>;
    if (node.format & 2) el = <em key={index}>{el}</em>;
    if (node.format & 4) el = <s key={index} style={{ textDecoration: 'line-through' }}>{el}</s>;
    if (node.format & 8) el = <u key={index}>{el}</u>;
    if (node.format & 16) el = <code key={index} style={{ background: '#2d3748', padding: '2px 4px', borderRadius: '4px' }}>{el}</code>;
    return <React.Fragment key={index}>{el}</React.Fragment>;
  }

  if (node.type === 'paragraph') {
    const align = node.format === 2 ? 'right' : (node.format === 3 ? 'center' : 'left');
    return <p key={index} style={{ margin: '0 0 0.5em', textAlign: align as any }}>{node.children?.map((c: any, i: number) => renderNode(c, i, rootAst, onUpdateAST))}</p>;
  }

  if (node.type === 'heading') {
    const Tag = node.tag as any;
    const fSize = Tag === 'h1' ? '1.6rem' : (Tag === 'h2' ? '1.4rem' : '1.2rem');
    return <Tag key={index} style={{ fontSize: fSize, marginTop: '0.8em', marginBottom: '0.4em', fontWeight: 'bold', lineHeight: 1.2 }}>{node.children?.map((c: any, i: number) => renderNode(c, i, rootAst, onUpdateAST))}</Tag>;
  }

  if (node.type === 'list') {
    const Tag = node.listType === 'number' ? 'ol' : 'ul';
    return <Tag key={index} style={{ margin: '0.5em 0', paddingLeft: node.listType === 'check' ? '0' : '20px', listStyleType: node.listType === 'check' ? 'none' : 'inherit' }}>{node.children?.map((c: any, i: number) => renderNode(c, i, rootAst, onUpdateAST))}</Tag>;
  }

  if (node.type === 'listitem') {
    if (node.checked !== undefined) {
      const isDone = node.checked && node.value !== 3;
      const isCancelled = node.checked && node.value === 3;

      return (
        <li key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (onUpdateAST && rootAst) {
                if (!node.checked) { node.checked = true; node.value = 2; }
                else if (node.checked && node.value !== 3) { node.value = 3; }
                else { node.checked = false; node.value = 1; }
                onUpdateAST(JSON.stringify({ root: rootAst }));
              }
            }}
            style={{
              marginTop: '0.2rem', width: '24px', height: '24px', flexShrink: 0,
              border: '2px solid',
              borderColor: isDone ? '#4ade80' : (isCancelled ? '#f87171' : '#a78bfa'),
              background: isDone ? '#4ade80' : (isCancelled ? '#f87171' : 'rgba(0,0,0,0.5)'),
              borderRadius: '4px', cursor: onUpdateAST ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: '0.2s all', position: 'relative',
            }}
          >
            {isDone && <span style={{ color: 'black', fontSize: '14px', fontWeight: 'bold', lineHeight: 1, pointerEvents: 'none' }}>✓</span>}
            {isCancelled && <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold', lineHeight: 1, pointerEvents: 'none' }}>✕</span>}
          </div>
          <span style={{
            textDecoration: isCancelled ? 'line-through' : 'none',
            color: isDone ? '#4ade80' : (isCancelled ? '#718096' : 'inherit'),
            transition: '0.2s', opacity: isCancelled ? 0.6 : 1, marginTop: '0.1rem',
          }}>
            {node.children?.map((c: any, i: number) => renderNode(c, i, rootAst, onUpdateAST))}
          </span>
        </li>
      );
    }
    return <li key={index}>{node.children?.map((c: any, i: number) => renderNode(c, i, rootAst, onUpdateAST))}</li>;
  }

  if (node.type === 'quote') {
    return <blockquote key={index} style={{ borderLeft: '3px solid var(--accent)', paddingLeft: '10px', margin: '0.5em 0', color: '#a0aec0' }}>{node.children?.map((c: any, i: number) => renderNode(c, i, rootAst, onUpdateAST))}</blockquote>;
  }

  if (node.type === 'link') {
    const isInternal = node.url?.startsWith('note://');
    const href = isInternal ? '#' : node.url;
    const id = isInternal ? node.url.replace('note://', '') : null;

    return (
      <a
        key={index}
        href={href}
        onClick={(e) => {
          if (isInternal) { e.preventDefault(); e.stopPropagation(); (window as any).scrollToNote?.(id); }
        }}
        style={{
          color: isInternal ? '#93c5fd' : 'var(--accent)',
          textDecoration: 'underline',
          background: isInternal ? 'rgba(147, 197, 253, 0.1)' : 'transparent',
          padding: isInternal ? '2px 4px' : '0',
          borderRadius: isInternal ? '4px' : '0',
          fontWeight: isInternal ? 'bold' : 'normal',
        }}
      >
        {isInternal && '🔗 '}
        {node.children?.map((c: any, i: number) => {
          if (isInternal && c.type === 'text' && c.text) {
            return renderNode({ ...c, text: c.text.replace(/^\[\[/g, '').replace(/\]\]$/g, '') }, i, rootAst, onUpdateAST);
          }
          return renderNode(c, i, rootAst, onUpdateAST);
        })}
      </a>
    );
  }

  if (node.type === 'code') {
    // code-highlight children just have .text, extract it directly
    const codeText = node.children?.map((c: any) => c.text ?? '').join('') ?? '';
    return <pre key={index} style={{ background: '#1a202c', padding: '12px', borderRadius: '8px', border: '1px solid #2d3748', overflowX: 'auto', margin: '0.5em 0' }}><code style={{ fontFamily: 'monospace', color: '#e2e8f0' }}>{codeText}</code></pre>;
  }

  if (node.type === 'code-highlight') {
    return <React.Fragment key={index}>{node.text ?? ''}</React.Fragment>;
  }

  if (node.type === 'attachment') {
    const ft = node.fileType || getFileType(node.src || '');
    return <AttachmentDisplay key={index} src={node.src || ''} name={node.name || ''} fileType={ft} size={node.size || 0} />;
  }

  return <React.Fragment key={index}>{node.children?.map((c: any, i: number) => renderNode(c, i, rootAst, onUpdateAST))}</React.Fragment>;
};

export const LexicalRender = ({ astString, onUpdateAST }: { astString: string; onUpdateAST?: (ast: string) => void }) => {
  if (!astString) return null;

  let root: any = null;
  try {
    let ast = JSON.parse(astString);
    if (ast.text && typeof ast.text === 'string' && ast.text.startsWith('{"root"')) {
      try { ast = JSON.parse(ast.text); } catch { /* ignore */ }
    }
    if (ast.root) root = ast.root;
    else if (ast.text) return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ast.text}</div>;
    else return <div>{astString}</div>;
  } catch {
    return <div>{astString}</div>;
  }

  if (!root) return null;
  return <div className="lexical-content" style={{ pointerEvents: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{root.children?.map((c: any, i: number) => renderNode(c, i, root, onUpdateAST))}</div>;
};
