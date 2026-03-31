import React, { useEffect } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import {
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $createTextNode,
  TextNode
} from 'lexical';
import { HeadingNode, QuoteNode, $createHeadingNode, $isHeadingNode } from '@lexical/rich-text';
import { ListItemNode, ListNode, INSERT_CHECK_LIST_COMMAND, $isListItemNode } from '@lexical/list';
import { CodeNode, CodeHighlightNode, $createCodeNode, $isCodeNode } from '@lexical/code';
import { AutoLinkNode, LinkNode, TOGGLE_LINK_COMMAND, $createLinkNode } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin, MenuOption, useBasicTypeaheadTriggerMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
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

// Панель WYSIWYG (Жирный, курсив, чекбоксы, заголовки, код)
function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  
  const btnStyle = { background: 'rgba(255,255,255,0.1)', border: 'none', color: '#e2e8f0', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.9rem', transition: '0.2s' };
  
  const toggleHeading = () => {
    editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
           selection.getNodes().forEach(node => {
               const target = (node.getType() === 'paragraph' || $isHeadingNode(node)) ? node : node.getParent();
               if (!target) return;
               if (target.getType() === 'paragraph') {
                   const heading = $createHeadingNode('h2');
                   heading.append(...(target as any).getChildren());
                   target.replace(heading);
               } else if ($isHeadingNode(target)) {
                   const p = $createParagraphNode();
                   p.append(...(target as any).getChildren());
                   target.replace(p);
               }
           });
        }
    });
  };

  const toggleCode = () => {
    editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
           selection.getNodes().forEach(node => {
               const target = (node.getType() === 'paragraph' || $isCodeNode(node)) ? node : node.getParent();
               if (!target) return;
               if (target.getType() === 'paragraph') {
                   const code = $createCodeNode();
                   code.append(...(target as any).getChildren());
                   target.replace(code);
               } else if ($isCodeNode(target)) {
                   const p = $createParagraphNode();
                   p.append(...(target as any).getChildren());
                   target.replace(p);
               }
           });
        }
    });
  };

  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexWrap: 'wrap' }}>
      <button type="button" style={{ ...btnStyle, fontWeight: 'bold' }} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}>Ж</button>
      <button type="button" style={{ ...btnStyle, fontStyle: 'italic' }} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}>К</button>
      <button type="button" style={{ ...btnStyle, textDecoration: 'underline' }} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}>Ч</button>
      <button type="button" style={{ ...btnStyle, textDecoration: 'line-through' }} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}>S</button>
      <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
      <button type="button" style={btnStyle} onClick={toggleHeading}>H2 Заголовок</button>
      <button type="button" style={btnStyle} onClick={toggleCode}>&lt;/&gt; Код</button>
      <button type="button" style={btnStyle} onClick={() => {
         editor.update(() => {
             const selection = $getSelection();
             if ($isRangeSelection(selection)) {
                 selection.insertText('[[');
             }
         });
      }}>🔗 Линк</button>
      <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
      <button type="button" style={btnStyle} onClick={() => editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)}>☑ Чеклист</button>
    </div>
  );
}

// Вместо борьбы с CSS ::before — инжектим реальный <div> после каждого
// обновления Lexical. Визуал только через CSS data-state (без innerHTML),
// чтобы не триггерить childList-мутации в MutationObserver Lexical.
// Клики — делегирование на root в capture-фазе.
function ThreeStateCheckListPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const syncCheckbox = (li: HTMLElement) => {
      const isChecked = li.getAttribute('aria-checked') === 'true';
      const value = parseInt(li.getAttribute('value') || '1', 10);
      const state = isChecked && value !== 3 ? 'done' : isChecked && value === 3 ? 'cancelled' : 'unchecked';

      let box = li.querySelector<HTMLElement>('.tsc-box');
      if (!box) {
        box = document.createElement('div');
        box.className = 'tsc-box';
        li.insertBefore(box, li.firstChild);
      }
      if (li.firstChild !== box) li.insertBefore(box, li.firstChild);

      // Только атрибут — не трогаем innerHTML, чтобы не вызывать childList-мутации
      if (box.dataset.state !== state) box.dataset.state = state;
    };

    const getCheckboxLi = (e: MouseEvent): HTMLElement | null => {
      const target = e.target as HTMLElement | null;
      if (!target) return null;
      const li = target.closest('li[role="checkbox"]') as HTMLElement | null;
      if (!li) return null;
      const box = li.querySelector<HTMLElement>('.tsc-box');
      if (!box) return null;
      const rect = box.getBoundingClientRect();
      if (e.clientX >= rect.left - 4 && e.clientX <= rect.right + 4 &&
          e.clientY >= rect.top - 4 && e.clientY <= rect.bottom + 4) {
        return li;
      }
      return null;
    };

    const handleClick = (e: MouseEvent) => {
      const li = getCheckboxLi(e);
      if (!li) return;
      e.preventDefault();
      e.stopPropagation();
      editor.update(() => {
        const node = $getNearestNodeFromDOMNode(li);
        if (!$isListItemNode(node) || node.getChecked() === undefined) return;
        const checked = node.getChecked();
        const val = node.getValue();
        if (!checked) { node.setChecked(true); node.setValue(2); }
        else if (val !== 3) { node.setValue(3); }
        else { node.setChecked(false); node.setValue(1); }
      });
    };

    // preventDefault только — не stopPropagation, чтобы не ломать обработку Lexical
    const handlePointerDown = (e: MouseEvent) => {
      if (getCheckboxLi(e)) e.preventDefault();
    };

    const cleanupUpdate = editor.registerUpdateListener(() => {
      const root = editor.getRootElement();
      if (!root) return;
      root.querySelectorAll<HTMLElement>('li[role="checkbox"]').forEach(syncCheckbox);
    });

    // Получаем root один раз и добавляем listeners — cleanup корректно их снимает
    const root = editor.getRootElement();
    if (root) {
      root.addEventListener('click', handleClick as EventListener, { capture: true });
      root.addEventListener('pointerdown', handlePointerDown as EventListener, { capture: true });
      root.addEventListener('mousedown', handlePointerDown as EventListener, { capture: true });
    }

    return () => {
      cleanupUpdate();
      const r = editor.getRootElement();
      if (r) {
        r.removeEventListener('click', handleClick as EventListener, { capture: true });
        r.removeEventListener('pointerdown', handlePointerDown as EventListener, { capture: true });
        r.removeEventListener('mousedown', handlePointerDown as EventListener, { capture: true });
      }
    };
  }, [editor]);

  return null;
}

function OnChangePlugin({ onChange }: { onChange: (stateStr: string) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
       onChange(JSON.stringify(editorState.toJSON()));
    });
  }, [editor, onChange]);
  return null;
}

function AutoFocusPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.focus();
  }, [editor]);
  return null;
}

class BacklinkOption extends MenuOption {
  id: string;
  title: string;

  constructor(title: string, id: string) {
    super(title);
    this.title = title;
    this.id = id;
  }
}

function BacklinkPlugin() {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<any[]>([]);
  const db = (window as any).db;

  const checkForTriggerMatch = React.useCallback((text: string) => {
    const match = /(?:^|\s)(\[\[([^\]]*))$/.exec(text);
    if (match) {
      return {
        replaceableString: match[1],
        matchingString: match[2],
        leadOffset: match.index + (match[0].length - match[1].length),
      };
    }
    return null;
  }, []);

  useEffect(() => {
    if (queryString !== null && db) {
      // Ищем только те заметки, где есть РЕАЛЬНЫЙ текст (не просто структура JSON)
      // Мы ищем по content, но исключаем саму структуру метаданных
      db.execO(`SELECT id, content FROM notes WHERE (content LIKE ?) AND (content NOT LIKE '{"root":{"children":[],%') LIMIT 15`, [`%${queryString}%`]).then((res: any) => {
        setResults(res.map((n: any) => {
           let text = '';
           try {
              const parsed = JSON.parse(n.content);
              const extractAllText = (node: any): string => {
                if (node.type === 'text') return node.text || '';
                if (node.children) return node.children.map((c: any) => extractAllText(c)).join(' ');
                return '';
              };
              text = extractAllText(parsed.root).trim();
           } catch(e) { 
              text = n.content;
           }
           
           if (!text) text = n.id;
           if (text.length > 50) text = text.slice(0, 50) + '...';
           return { id: n.id, title: text };
        }));
      });
    }
  }, [queryString, db]);

  const options = React.useMemo(() => {
    return results.map(r => new BacklinkOption(r.title, r.id));
  }, [results]);

  return (
    <LexicalTypeaheadMenuPlugin<BacklinkOption>
      onQueryChange={setQueryString}
      onSelectOption={(option, userSelect, closeMenu) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const anchor = selection.anchor;
            // Удаляем триггер [[
            if (anchor.type === 'text') {
               const node = anchor.getNode();
               const textContent = node.getTextContent();
               const triggerIndex = textContent.lastIndexOf('[[', anchor.offset);
               if (triggerIndex !== -1) {
                  node.spliceText(triggerIndex, anchor.offset - triggerIndex, '');
               }
            }
            // Создаем узел ссылки
            const linkNode = $createLinkNode(`note://${option.id}`);
            const textNode = $createTextNode(`[[${option.title}]]`);
            linkNode.append(textNode);
            selection.insertNodes([linkNode]);
            selection.insertText(' ');
          }
        });
        closeMenu();
      }}
      triggerFn={checkForTriggerMatch}
      options={options}
      menuRenderFn={(anchorElementRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex, options: menuOptions }) => {
        if (!anchorElementRef.current || menuOptions.length === 0) return null;
        return (
          <div style={{ position: 'fixed', background: '#1e293b', border: '1px solid #475569', borderRadius: '8px', zIndex: 10000, color: 'white', minWidth: '280px', boxShadow: '0 10px 25px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
            {menuOptions.map((option: BacklinkOption, i: number) => {
              return (
                <div 
                  key={option.key}
                  ref={(el) => option.setRefElement(el)}
                  onClick={() => selectOptionAndCleanUp(option)}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  style={{ padding: '10px 14px', cursor: 'grab', background: i === selectedIndex ? '#3b82f6' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.05)', transition: '0.1s background' }}
                >
                  <div style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '2px', fontFamily: 'monospace' }}>{option.id}</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 500, color: i === selectedIndex ? 'white' : '#e2e8f0' }}>{option.title}</div>
                </div>
              );
            })}
          </div>
        );
      }}
    />
  );
}

const STATUSES = ['none', 'todo', 'doing', 'done', 'archived'];
const TYPES = ['tweet', 'task', 'document'];

const hasTextContent = (astStr: string): boolean => {
  try {
    const { root } = JSON.parse(astStr);
    const check = (node: any): boolean => {
      if (node.type === 'text') return (node.text || '').trim().length > 0;
      return (node.children || []).some(check);
    };
    return check(root);
  } catch {
    return !!astStr;
  }
};

export const TweetEditor = ({ 
   onSubmit, 
   onCancel,
   placeholder,
   buttonText = "Твитнуть",
   initialAst,
   initialPropsStr,
   autoFocus
}: { 
   onSubmit: (ast: string, propsJson: string) => void;
   onCancel?: () => void;
   placeholder: string;
   buttonText?: string;
   initialAst?: string;
   initialPropsStr?: string;
   autoFocus?: boolean;
}) => {
  const [val, setVal] = React.useState(initialAst || '');
  const [editorKey, setEditorKey] = React.useState(0);

  const initP = initialPropsStr ? JSON.parse(initialPropsStr) : {};
  const [type, setType] = React.useState(initP.type || 'tweet');
  const [status, setStatus] = React.useState(initP.status || 'none');
  const [date, setDate] = React.useState(initP.date || '');

  let initEditorState: any = undefined;
  if (initialAst) {
     try {
       let parsed = JSON.parse(initialAst);
       if (parsed.text && typeof parsed.text === 'string' && parsed.text.startsWith('{"root"')) {
           parsed = JSON.parse(parsed.text);
       }
       if (parsed.root) initEditorState = JSON.stringify(parsed);
     } catch(e) {}
  }

  const handleFireSubmit = () => {
    if (!val || !hasTextContent(val)) return;
    const propsJson = JSON.stringify({ type, status, date });
    onSubmit(val, propsJson);
    
    if (!initialAst) {
        setEditorKey(k => k + 1);
        setType('tweet');
        setStatus('none');
        setDate('');
        setVal('');
    }
  };

  const selStyle = { background: 'rgba(255,255,255,0.05)', color: '#93c5fd', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '0.8rem', padding: '4px 6px', cursor: 'pointer' };
  const optStyle = { backgroundColor: '#1e293b', color: '#e2e8f0' };

  return (
    <LexicalComposer key={editorKey + (initialAst || '')} initialConfig={{ namespace: 'editor', theme: EDITOR_THEME, nodes: EDITOR_NODES, onError: console.error, editorState: initEditorState }}>
      <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', background: 'rgba(0,0,0,0.5)', color: '#fff' }}>
        
        <ToolbarPlugin />

        <div style={{ position: 'relative' }}>
          <RichTextPlugin
            contentEditable={<ContentEditable style={{ outline: 'none', minHeight: '60px', padding: '4px', fontSize: '15px', color: '#e2e8f0', lineHeight: 1.5 }} />}
            placeholder={<div style={{ position: 'absolute', top: '4px', left: '4px', color: '#718096', pointerEvents: 'none' }}>{placeholder}</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
          {autoFocus && <AutoFocusPlugin />}
        </div>
        
        <HistoryPlugin />
        <LinkPlugin />
        <CheckListPlugin />
        <ThreeStateCheckListPlugin />
        
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        <OnChangePlugin onChange={setVal} />
        <BacklinkPlugin />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
             <select value={type} onChange={(e) => setType(e.target.value)} style={selStyle}>
                 {TYPES.map(s => <option key={s} value={s} style={optStyle}>{s}</option>)}
             </select>
             <select value={status} onChange={(e) => setStatus(e.target.value)} style={{...selStyle, color: '#dcfce7'}}>
                 {STATUSES.map(s => <option key={s} value={s} style={optStyle}>{s}</option>)}
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

const renderLexicalNode = (node: any, index: number, rootAst: any, onUpdateAST?: (ast: string) => void): React.ReactNode => {
   if (!node) return null;
   if (node.type === 'text') {
      let el: any = node.text;
      if (node.format & 1) el = <strong key={index}>{el}</strong>; 
      if (node.format & 2) el = <em key={index}>{el}</em>;       
      if (node.format & 4) el = <s key={index} style={{textDecoration: 'line-through'}}>{el}</s>;
      if (node.format & 8) el = <u key={index}>{el}</u>;       
      if (node.format & 16) el = <code key={index} style={{ background: '#2d3748', padding: '2px 4px', borderRadius: '4px' }}>{el}</code>;    
      return <React.Fragment key={index}>{el}</React.Fragment>;
   }
   if (node.type === 'paragraph') {
      const align = node.format === 2 ? 'right' : (node.format === 3 ? 'center' : 'left');
      return <p key={index} style={{margin: '0 0 0.5em', textAlign: align}}>{node.children?.map((c:any, i:number) => renderLexicalNode(c, i, rootAst, onUpdateAST))}</p>;
   }
   if (node.type === 'heading') {
      const Tag = node.tag as any;
      const fSize = Tag === 'h1' ? '1.6rem' : (Tag === 'h2' ? '1.4rem' : '1.2rem');
      return <Tag key={index} style={{ fontSize: fSize, marginTop: '0.8em', marginBottom: '0.4em', fontWeight: 'bold', lineHeight: 1.2 }}>{node.children?.map((c:any, i:number) => renderLexicalNode(c, i, rootAst, onUpdateAST))}</Tag>;
   }
   if (node.type === 'list') {
      const Tag = node.listType === 'number' ? 'ol' : 'ul';
      return <Tag key={index} style={{margin: '0.5em 0', paddingLeft: node.listType === 'check' ? '0' : '20px', listStyleType: node.listType === 'check' ? 'none' : 'inherit'}}>{node.children?.map((c:any, i:number) => renderLexicalNode(c, i, rootAst, onUpdateAST))}</Tag>;
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
                      if (!node.checked) {
                          node.checked = true;
                          node.value = 2;
                      } else if (node.checked && node.value !== 3) {
                          node.value = 3;
                      } else {
                          node.checked = false;
                          node.value = 1;
                      }
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
                     transition: '0.2s all',
                     position: 'relative'
                  }}
               >
                  {isDone && <span style={{color:'black', fontSize: '14px', fontWeight:'bold', lineHeight: 1, pointerEvents: 'none'}}>✓</span>}
                  {isCancelled && <span style={{color:'white', fontSize: '12px', fontWeight:'bold', lineHeight: 1, pointerEvents: 'none'}}>✕</span>}
               </div>

               <span style={{ 
                   textDecoration: isCancelled ? 'line-through' : 'none', 
                   color: isDone ? '#4ade80' : (isCancelled ? '#718096' : 'inherit'),
                   transition: '0.2s',
                   opacity: isCancelled ? 0.6 : 1,
                   marginTop: '0.1rem'
               }}>
                  {node.children?.map((c:any, i:number) => renderLexicalNode(c, i, rootAst, onUpdateAST))}
               </span>
            </li>
         );
      }
      return <li key={index}>{node.children?.map((c:any, i:number) => renderLexicalNode(c, i, rootAst, onUpdateAST))}</li>;
   }
   if (node.type === 'quote') return <blockquote key={index} style={{borderLeft: '3px solid var(--accent)', paddingLeft: '10px', margin: '0.5em 0', color: '#a0aec0'}}>{node.children?.map((c:any, i:number) => renderLexicalNode(c, i, rootAst, onUpdateAST))}</blockquote>;
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
               fontWeight: isInternal ? 'bold' : 'normal'
            }}
         >
            {isInternal && '🔗 '}
            {node.children?.map((c:any, i:number) => {
               if (isInternal && c.type === 'text' && c.text) {
                  return renderLexicalNode({ ...c, text: c.text.replace(/^\[\[/g, '').replace(/\]\]$/g, '') }, i, rootAst, onUpdateAST);
               }
               return renderLexicalNode(c, i, rootAst, onUpdateAST);
            })}
         </a>
      );
   }
   if (node.type === 'code') return <pre key={index} style={{ background: '#1a202c', padding: '12px', borderRadius: '8px', border: '1px solid #2d3748', overflowX: 'auto', margin: '0.5em 0' }}><code style={{ fontFamily: 'monospace', color: '#e2e8f0' }}>{node.children?.map((c:any, i:number) => renderLexicalNode(c, i, rootAst, onUpdateAST))}</code></pre>;
   
   return <React.Fragment key={index}>{node.children?.map((c:any, i:number) => renderLexicalNode(c, i, rootAst, onUpdateAST))}</React.Fragment>;
};

export const LexicalRender = ({ astString, onUpdateAST }: { astString: string, onUpdateAST?: (ast: string) => void }) => {
   if (!astString) return null;
   
   let root: any = null;
   try {
     let ast = JSON.parse(astString);
     
     if (ast.text && typeof ast.text === 'string' && ast.text.startsWith('{"root"')) {
         try { ast = JSON.parse(ast.text); } catch(e) {}
     }
     
     if (ast.root) root = ast.root; 
     else if (ast.text) return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ast.text}</div>; 
     else return <div>{astString}</div>; 
   } catch (e) {
     return <div>{astString}</div>; 
   }

   if (!root) return null;
   return <div className="lexical-content" style={{ pointerEvents: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{root.children?.map((c:any, i:number) => renderLexicalNode(c, i, root, onUpdateAST))}</div>;
};
