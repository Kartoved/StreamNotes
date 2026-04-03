import React, { useState, useEffect } from 'react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import type { NodeViewProps } from '@tiptap/core';
import { resolveUrl, formatSize } from '../../utils/opfsFiles';
import { Lightbox } from '../components/Lightbox';

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

export const AttachmentExtension = Node.create({
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
