import React, { useState, useEffect } from 'react';
import { resolveUrl, getFileType, formatSize } from '../utils/opfsFiles';
import { Lightbox } from './components/Lightbox';

// ─── Attachment display for read-only render ──────────────────────────
export const AttachmentDisplay = ({ src, name, fileType, size, inGrid }: { src: string; name: string; fileType: string; size: number; inGrid?: boolean }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  
  useEffect(() => { 
    resolveUrl(src).then(setUrl).catch(() => setError(true)); 
  }, [src]);

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

export const renderTiptapNode = (node: any, index: number, onUpdateAST?: (ast: string) => void, docJson?: any): React.ReactNode => {
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
    if (marks.includes('code')) el = <code style={{ background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: '3px', fontSize: '0.88em', fontFamily: 'var(--font-mono)', border: '1px solid var(--line)' }}>{el}</code>;
    if (linkMark) {
      const href: string = linkMark.attrs?.href || '';
      const isInternal = href.startsWith('note://');
      const id = isInternal ? href.replace('note://', '') : null;
      el = (
        <a
          href={isInternal ? '#' : href}
          onClick={(e) => { if (isInternal) { e.preventDefault(); e.stopPropagation(); (window as any).scrollToNote?.(id); } }}
          style={{ color: 'var(--text)', textDecoration: 'underline', textDecorationColor: isInternal ? 'var(--text-faint)' : 'var(--line-strong)', textDecorationStyle: isInternal ? 'dashed' : 'solid', cursor: 'pointer' }}
        >
          {node.text?.replace(/^\[+/, '').replace(/\]+$/, '') || node.text}
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
