import React, { useState, useEffect } from 'react';
import { resolveUrl, getFileType, formatSize } from '../utils/opfsFiles';

// ─── SVG Icons ────────────────────────────────────────────────────────
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

// ─── Attachment display for read-only render ──────────────────────────
export const AttachmentDisplay = ({ src, name, fileType, size, inGrid }: { src: string; name: string; fileType: string; size: number; inGrid?: boolean }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  
  useEffect(() => { 
    resolveUrl(src).then(setUrl).catch(() => setError(true)); 
  }, [src]);

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    display: 'block',
    margin: inGrid ? 0 : '0.8em 0',
    borderRadius: 'var(--radius-lg)',
    transition: 'all 0.15s ease',
  };

  const downloadBtn = (
    <a
      href={url || '#'}
      download={name}
      title="Download"
      onClick={e => e.stopPropagation()}
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

  if (error) return <div style={{ ...containerStyle, padding: '10px 14px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.85rem', color: '#ef4444' }}>⚠ {name}</div>;
  if (!url) return <div style={{ ...containerStyle, padding: '10px 14px', border: '1px solid var(--line)', background: 'var(--bg-aside)', fontSize: '0.85rem', color: 'var(--text-sub)' }}>⏳ {name}...</div>;

  if (fileType === 'image') return (
    <div
      style={containerStyle}
      className="attachment-card"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <img
        src={url} alt={name}
        draggable={false}
        onClick={e => { e.stopPropagation(); (window as any).openLightbox?.(url, name); }}
        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
        onDragStart={e => e.preventDefault()}
        onError={() => setError(true)}
        style={{
          width: '100%',
          maxHeight: inGrid ? '140px' : '400px',
          objectFit: inGrid ? 'cover' : 'contain',
          borderRadius: 'var(--radius)',
          display: 'block',
          cursor: 'zoom-in',
          background: 'var(--bg-aside)',
          border: '1px solid var(--line)',
        }}
      />
      <div style={{ position: 'absolute', top: '8px', right: '8px', opacity: 0, transition: 'opacity 0.2s' }} className="attachment-actions">
        {downloadBtn}
      </div>
      <style>{`.attachment-card:hover .attachment-actions { opacity: 1 !important; }`}</style>
    </div>
  );

  if (fileType === 'video') return (
    <div style={containerStyle} className="attachment-card" onClick={e => e.stopPropagation()}>
      <video src={url} controls style={{ width: '100%', borderRadius: 'var(--radius)', display: 'block', background: '#000' }} />
    </div>
  );

  return (
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
      </div>
    </div>
  );
};

// ─── TipTap Read-only Renderer ────────────────────────────────────────
// Renders TipTap JSON (doc format) into React elements without a full editor.

export const renderTiptapNode = (node: any, index: number, onUpdateAST?: (ast: string) => void, docJson?: any): React.ReactNode => {
  if (!node) return null;
  const ch = () => (node.content || []).map((c: any, i: number) => renderTiptapNode(c, i, onUpdateAST, docJson));

  if (node.type === 'text') {
    const marks: string[] = (node.marks || []).map((m: any) => m.type);
    const linkMark = (node.marks || []).find((m: any) => m.type === 'link');
    let el: React.ReactNode = node.text;

    const isCode = marks.includes('code');
    const hashtagRegex = /#[\w\u0400-\u04FF][\w\u0400-\u04FF0-9_]*/gi;

    if (linkMark) {
      const href: string = linkMark.attrs?.href || '';
      const isInternal = href.startsWith('note://');
      const noteId = isInternal ? href.replace('note://', '') : null;
      el = (
        <a
          href={isInternal ? '#' : href}
          target={isInternal ? undefined : '_blank'}
          rel={isInternal ? undefined : 'noopener noreferrer'}
          onClick={(e) => {
            if (isInternal) {
              e.preventDefault();
              e.stopPropagation();
              (window as any).navigateToNote?.(noteId) ?? (window as any).scrollToNote?.(noteId);
            }
          }}
          style={isInternal ? {
            display: 'inline',
            background: 'var(--accent-bg)',
            border: '1px solid var(--line-strong)',
            borderRadius: '4px',
            padding: '1px 6px 2px',
            textDecoration: 'none',
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: '0.92em',
          } : {
            color: 'var(--text)',
            textDecoration: 'underline',
            textDecorationColor: 'var(--line-strong)',
            cursor: 'pointer',
          }}
        >
          {node.text}
        </a>
      );
    } else if (!isCode && node.text?.match(hashtagRegex)) {
      // Process hashtags in non-link, non-code text
      const parts = node.text.split(hashtagRegex);
      const matches = node.text.match(hashtagRegex) || [];
      const combined: React.ReactNode[] = [];
      parts.forEach((part: string, i: number) => {
        combined.push(part);
        if (matches[i]) {
          combined.push(
            <span
              key={i}
              className="hashtag-decorator"
              onClick={(e) => {
                e.stopPropagation();
                (window as any).onHashtagClick?.(matches[i]);
              }}
              style={{
                color: 'var(--accent)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {matches[i]}
            </span>
          );
        }
      });
      el = <>{combined}</>;
    }

    if (marks.includes('bold')) el = <strong>{el}</strong>;
    if (marks.includes('italic')) el = <em>{el}</em>;
    if (marks.includes('strike')) el = <s style={{ textDecoration: 'line-through' }}>{el}</s>;
    if (marks.includes('underline')) el = <u>{el}</u>;
    if (marks.includes('code')) el = <code style={{ background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: '3px', fontSize: '0.88em', fontFamily: 'var(--font-mono)', border: '1px solid var(--line)' }}>{el}</code>;

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
      <li key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '6px' }}>
        {/* checkbox box */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (!onUpdateAST || !docJson) return;
            const next = state === 'unchecked' ? 'done' : state === 'done' ? 'cancelled' : 'unchecked';
            node.attrs = { ...node.attrs, state: next, checked: next !== 'unchecked' };
            onUpdateAST(JSON.stringify(docJson));
          }}
          style={{
            marginTop: '4px',
            width: '16px', height: '16px', flexShrink: 0,
            border: '1.5px solid',
            borderColor: isDone ? 'var(--text)' : isCancelled ? 'var(--line-strong)' : 'var(--line-strong)',
            background: isDone ? 'var(--text)' : isCancelled ? 'var(--bg-hover)' : 'var(--bg)',
            borderRadius: '3px',
            cursor: onUpdateAST ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'border-color 0.12s, background 0.12s',
          }}
        >
          {isDone && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none" style={{ pointerEvents: 'none' }}>
              <path d="M1 3.5L3.8 6.5L9 1" stroke="var(--bg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {isCancelled && (
            <svg width="8" height="2" viewBox="0 0 8 2" fill="none" style={{ pointerEvents: 'none' }}>
              <path d="M0 1H8" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </div>
        {/* text */}
        <span style={{
          textDecoration: (isDone || isCancelled) ? 'line-through' : 'none',
          textDecorationColor: 'var(--line-strong)',
          color: (isDone || isCancelled) ? 'var(--text-faint)' : 'inherit',
          opacity: isCancelled ? 0.6 : 1,
          marginTop: '0.05rem',
        }}>
          {ch()}
        </span>
      </li>
    );
  }

  if (node.type === 'blockquote') {
    return <blockquote key={index} style={{ borderLeft: '2px solid var(--line-strong)', paddingLeft: '12px', margin: '0.5em 0', color: 'var(--text-sub)' }}>{ch()}</blockquote>;
  }

  if (node.type === 'codeBlock') {
    const code = (node.content || []).map((c: any) => c.text ?? '').join('');
    return <pre key={index} style={{ background: 'var(--bg-hover)', padding: '12px 16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--line)', overflowX: 'auto', margin: '0.5em 0', fontFamily: 'var(--font-mono)' }}><code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: '0.9em' }}>{code}</code></pre>;
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
