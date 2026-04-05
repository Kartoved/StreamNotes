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

  const FileIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );

  const DownloadIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );

  const CloseIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    display: 'block',
    margin: '0.8em 0',
    outline: selected ? '2px solid var(--accent-warm)' : 'none',
    borderRadius: 'var(--radius-lg)',
    transition: 'all 0.15s ease',
  };

  const deleteBtn = (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); deleteNode(); }}
      title="Delete"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-hover)', border: 'none', color: 'var(--text-sub)',
        width: '28px', height: '28px',
        borderRadius: 'var(--radius)', cursor: 'pointer',
        transition: 'all 0.1s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#ef4444'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-sub)'; }}
    >
      <CloseIcon />
    </button>
  );

  const downloadBtn = (
    <a
      href={url || '#'}
      download={name}
      title="Download"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-hover)', color: 'var(--text-sub)',
        width: '28px', height: '28px',
        borderRadius: 'var(--radius)', textDecoration: 'none',
        transition: 'all 0.1s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-active)'; e.currentTarget.style.color = 'var(--text)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-sub)'; }}
    >
      <DownloadIcon />
    </a>
  );

  if (error) return (
    <NodeViewWrapper>
      <div style={{ ...containerStyle, padding: '10px 14px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ color: '#ef4444' }}><CloseIcon /></div>
        <div style={{ flex: 1, fontSize: '0.85rem', color: '#ef4444', opacity: 0.8 }}>File not found: {name}</div>
        {deleteBtn}
      </div>
    </NodeViewWrapper>
  );

  if (!url) return (
    <NodeViewWrapper>
      <div style={{ ...containerStyle, padding: '10px 14px', border: '1px solid var(--line)', background: 'var(--bg-aside)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div className="rec-pulse" style={{ color: 'var(--text-faint)' }}><FileIcon /></div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>{name}...</div>
      </div>
    </NodeViewWrapper>
  );

  if (fileType === 'image') return (
    <NodeViewWrapper className="attachment-node-img">
      <div style={containerStyle} className="attachment-card">
        <img
          src={url} alt={name}
          onClick={() => setLightbox(true)}
          style={{ width: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: 'var(--radius)', display: 'block', cursor: 'zoom-in', background: 'var(--bg-aside)', border: '1px solid var(--line)' }}
          onError={() => setError(true)}
        />
        <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '6px', opacity: 0, transition: 'opacity 0.2s' }} className="attachment-actions">
          {downloadBtn}
          {deleteBtn}
        </div>
        <style>{`.attachment-node-img:hover .attachment-actions { opacity: 1 !important; }`}</style>
        {lightbox && <Lightbox url={url} name={name} onClose={() => setLightbox(false)} />}
      </div>
    </NodeViewWrapper>
  );

  if (fileType === 'video') return (
    <NodeViewWrapper>
      <div style={containerStyle} className="attachment-card">
        <video src={url} controls style={{ width: '100%', borderRadius: 'var(--radius)', display: 'block', background: '#000' }} />
        <div style={{ position: 'absolute', top: '8px', right: '8px', opacity: 0, transition: 'opacity 0.2s' }} className="attachment-actions">
          {deleteBtn}
        </div>
        <style>{`.attachment-card:hover .attachment-actions { opacity: 1 !important; }`}</style>
      </div>
    </NodeViewWrapper>
  );

  return (
    <NodeViewWrapper>
      <div style={{ 
        ...containerStyle, 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px', 
        padding: '10px 12px', 
        background: 'var(--card-bg)', 
        border: '1px solid var(--line)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: 'var(--radius)', background: 'var(--bg-hover)', color: 'var(--text-sub)' }}>
          <FileIcon />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)' }}>{formatSize(size)}</div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {downloadBtn}
          {deleteBtn}
        </div>
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
