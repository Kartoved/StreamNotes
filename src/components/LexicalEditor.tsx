import React, { useEffect } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { FORMAT_TEXT_COMMAND, FORMAT_ELEMENT_COMMAND } from 'lexical';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode, INSERT_CHECK_LIST_COMMAND } from '@lexical/list';
import { CodeNode, CodeHighlightNode } from '@lexical/code';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { TRANSFORMERS } from '@lexical/markdown';
import '../editorTheme.css'; // Импортируем стили темы

const EDITOR_NODES = [
  HeadingNode,
  ListNode,
  ListItemNode,
  QuoteNode,
  CodeNode,
  CodeHighlightNode,
  AutoLinkNode,
  LinkNode
];

const EDITOR_THEME = {
  text: {
    bold: 'editor-text-bold',
    italic: 'editor-text-italic',
    underline: 'editor-text-underline',
    strikethrough: 'editor-text-strikethrough',
    underlineStrikethrough: 'editor-text-underlineStrikethrough',
    code: 'editor-text-code',
  },
  list: {
    ul: 'editor-ul',
    ol: 'editor-ol',
    listitem: 'editor-listitem',
    listitemChecked: 'editor-checked',
    listitemUnchecked: 'editor-unchecked',
  },
  heading: {
    h1: 'editor-h1',
    h2: 'editor-h2',
    h3: 'editor-h3',
  }
};

// Панель WYSIWYG (Жирный, курсив, чекбоксы)
function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  
  const btnStyle = { background: 'rgba(255,255,255,0.1)', border: 'none', color: '#e2e8f0', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.9rem', transition: '0.2s' };
  
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexWrap: 'wrap' }}>
      <button type="button" style={{ ...btnStyle, fontWeight: 'bold' }} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}>Ж</button>
      <button type="button" style={{ ...btnStyle, fontStyle: 'italic' }} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}>К</button>
      <button type="button" style={{ ...btnStyle, textDecoration: 'underline' }} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}>Ч</button>
      <button type="button" style={{ ...btnStyle, textDecoration: 'line-through' }} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}>S</button>
      <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
      <button type="button" style={btnStyle} onClick={() => editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)}>☑ Чеклист</button>
      <button type="button" style={btnStyle} onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center')}>По центру</button>
    </div>
  );
}

// Плагин, который слушает AST изменения и выплёвывает JSON State
function OnChangePlugin({ onChange }: { onChange: (stateStr: string) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
       onChange(JSON.stringify(editorState.toJSON()));
    });
  }, [editor, onChange]);
  return null;
}

const STATUSES = ['неразобранное', 'todo', 'doing', 'done', 'cancelled', 'archived'];
const TYPES = ['tweet', 'task', 'document'];
const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'];

export const TweetEditor = ({ 
   onSubmit, 
   onCancel,
   placeholder,
   buttonText = "Твитнуть"
}: { 
   onSubmit: (ast: string, propsJson: string) => void;
   onCancel?: () => void;
   placeholder: string;
   buttonText?: string;
}) => {
  const [val, setVal] = React.useState('');
  const [editorKey, setEditorKey] = React.useState(0); // для сброса состояния

  const [type, setType] = React.useState('tweet');
  const [status, setStatus] = React.useState('неразобранное');
  const [priority, setPriority] = React.useState('none');
  const [date, setDate] = React.useState('');

  const handleFireSubmit = () => {
    if (!val) return;
    const propsJson = JSON.stringify({ type, status, priority, date });
    onSubmit(val, propsJson);
    
    // Сбрасываем всё после успешной отправки
    setEditorKey(k => k + 1);
    setType('tweet');
    setStatus('неразобранное');
    setPriority('none');
    setDate('');
    setVal('');
  };

  const selStyle = { background: 'rgba(255,255,255,0.05)', color: '#93c5fd', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '0.8rem', padding: '4px 6px', cursor: 'pointer' };

  return (
    <LexicalComposer key={editorKey} initialConfig={{ namespace: 'editor', theme: EDITOR_THEME, nodes: EDITOR_NODES, onError: console.error }}>
      <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', background: 'rgba(0,0,0,0.5)', color: '#fff' }}>
        
        {/* Панель WYSIWYG */}
        <ToolbarPlugin />

        <div style={{ position: 'relative' }}>
          <RichTextPlugin
            contentEditable={<ContentEditable style={{ outline: 'none', minHeight: '60px', padding: '4px', fontSize: '15px', color: '#e2e8f0', lineHeight: 1.5 }} />}
            placeholder={<div style={{ position: 'absolute', top: '4px', left: '4px', color: '#718096', pointerEvents: 'none' }}>{placeholder}</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        
        <HistoryPlugin />
        <CheckListPlugin />
        
        {/* Магия Markdown */}
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        
        <OnChangePlugin onChange={setVal} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
             <select value={type} onChange={(e) => setType(e.target.value)} style={selStyle}>
                 {TYPES.map(s => <option key={s} value={s}>{s}</option>)}
             </select>
             <select value={status} onChange={(e) => setStatus(e.target.value)} style={{...selStyle, color: '#dcfce7'}}>
                 {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
             </select>
             <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{...selStyle, color: priority === 'urgent' ? '#fca5a5' : '#fde047'}}>
                 {PRIORITIES.map(s => <option key={s} value={s}>{s}</option>)}
             </select>
             <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{...selStyle, color: 'white', colorScheme: 'dark' }} />
             
             <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
               {onCancel && (
                 <button type="button" onClick={onCancel} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer' }}>Отмена</button>
               )}
               <button type="button" onClick={handleFireSubmit} style={{ background: 'var(--accent)', border: 'none', color: 'white', padding: '6px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>{buttonText}</button>
             </div>
        </div>
      </div>
    </LexicalComposer>
  );
};

// Функция для ультрабыстрого рендера Lexical AST напрямую в React DOM
const renderLexicalNode = (node: any, index: number): React.ReactNode => {
   if (!node) return null;
   if (node.type === 'text') {
      let el: any = node.text;
      if (node.format & 1) el = <strong key={index}>{el}</strong>; 
      if (node.format & 2) el = <em key={index}>{el}</em>;       
      if (node.format & 4) el = <s key={index} style={{textDecoration: 'line-through'}}>{el}</s>; // Strikethrough
      if (node.format & 8) el = <u key={index}>{el}</u>;       
      if (node.format & 16) el = <code key={index} style={{ background: '#2d3748', padding: '2px 4px', borderRadius: '4px' }}>{el}</code>;    
      return <React.Fragment key={index}>{el}</React.Fragment>;
   }
   if (node.type === 'paragraph') {
      const align = node.format === 2 ? 'right' : (node.format === 3 ? 'center' : 'left');
      return <p key={index} style={{margin: '0 0 0.5em', textAlign: align}}>{node.children?.map(renderLexicalNode)}</p>;
   }
   if (node.type === 'heading') {
      const Tag = node.tag as any;
      const fSize = Tag === 'h1' ? '1.6rem' : (Tag === 'h2' ? '1.4rem' : '1.2rem');
      return <Tag key={index} style={{ fontSize: fSize, marginTop: '0.8em', marginBottom: '0.4em', fontWeight: 'bold', lineHeight: 1.2 }}>{node.children?.map(renderLexicalNode)}</Tag>;
   }
   if (node.type === 'list') {
      const Tag = node.listType === 'number' ? 'ol' : 'ul';
      return <Tag key={index} style={{margin: '0.5em 0', paddingLeft: node.listType === 'check' ? '0' : '20px', listStyleType: node.listType === 'check' ? 'none' : 'inherit'}}>{node.children?.map(renderLexicalNode)}</Tag>;
   }
   if (node.type === 'listitem') {
      // Поддержка чекбоксов (CheckList). Важно: у элементов может быть 'value' по умолчанию, поэтому проверяем только 'checked'
      if (node.checked !== undefined) {
         return (
            <li key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
               <input type="checkbox" checked={node.checked} readOnly style={{ marginTop: '0.3rem', transform: 'scale(1.2)', accentColor: '#a78bfa' }} />
               <span style={{ textDecoration: node.checked ? 'line-through' : 'none', color: node.checked ? '#718096' : 'inherit' }}>
                  {node.children?.map(renderLexicalNode)}
               </span>
            </li>
         );
      }
      return <li key={index}>{node.children?.map(renderLexicalNode)}</li>;
   }
   if (node.type === 'quote') return <blockquote key={index} style={{borderLeft: '3px solid var(--accent)', paddingLeft: '10px', margin: '0.5em 0', color: '#a0aec0'}}>{node.children?.map(renderLexicalNode)}</blockquote>;
   if (node.type === 'link') return <a key={index} href={node.url} style={{color: 'var(--accent)', textDecoration: 'underline'}}>{node.children?.map(renderLexicalNode)}</a>;
   
   return <React.Fragment key={index}>{node.children?.map(renderLexicalNode)}</React.Fragment>;
};

export const LexicalRender = ({ astString }: { astString: string }) => {
   if (!astString) return null;
   
   let root: any = null;
   try {
     let ast = JSON.parse(astString);
     
     // Авто-восстановление твитов, которые случайно сохранились как двойной JSON
     if (ast.text && typeof ast.text === 'string' && ast.text.startsWith('{"root"')) {
         try { ast = JSON.parse(ast.text); } catch(e) {}
     }
     
     if (ast.root) root = ast.root; // Новый Lexical AST
     else if (ast.text) return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ast.text}</div>; 
     else return <div>{astString}</div>; // Фолбэк
   } catch (e) {
     return <div>{astString}</div>; // Plain text
   }

   if (!root) return null;
   return <div className="lexical-content" style={{ pointerEvents: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{root.children?.map(renderLexicalNode)}</div>;
};
