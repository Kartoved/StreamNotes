/**
 * Converts Lexical JSON AST → TipTap (ProseMirror) JSON.
 * Used for backward-compat with existing notes stored as Lexical AST.
 */

interface LexicalNode {
  type: string;
  children?: LexicalNode[];
  text?: string;
  format?: number;
  tag?: string;
  listType?: string;
  checked?: boolean;
  value?: number;
  url?: string;
  [key: string]: any;
}

interface PMNode {
  type: string;
  content?: PMNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, any> }[];
  attrs?: Record<string, any>;
}

function convertTextNode(node: LexicalNode): PMNode {
  const marks: { type: string; attrs?: Record<string, any> }[] = [];
  const fmt = node.format || 0;
  if (fmt & 1) marks.push({ type: 'bold' });
  if (fmt & 2) marks.push({ type: 'italic' });
  if (fmt & 4) marks.push({ type: 'strike' });
  if (fmt & 8) marks.push({ type: 'underline' });
  if (fmt & 16) marks.push({ type: 'code' });

  const result: PMNode = { type: 'text', text: node.text || '' };
  if (marks.length > 0) result.marks = marks;
  return result;
}

function convertChildren(children: LexicalNode[] | undefined): PMNode[] {
  if (!children) return [];
  return children.flatMap(convertNode).filter(Boolean) as PMNode[];
}

function convertNode(node: LexicalNode): PMNode | PMNode[] | null {
  switch (node.type) {
    case 'root':
      return { type: 'doc', content: convertChildren(node.children) };

    case 'text':
      return convertTextNode(node);

    case 'paragraph': {
      const content = convertChildren(node.children);
      const attrs: Record<string, any> = {};
      if (node.format === 2) attrs.textAlign = 'right';
      else if (node.format === 3) attrs.textAlign = 'center';
      return { type: 'paragraph', content: content.length ? content : undefined, ...(Object.keys(attrs).length ? { attrs } : {}) };
    }

    case 'heading': {
      const level = node.tag ? parseInt(node.tag.replace('h', ''), 10) : 2;
      const content = convertChildren(node.children);
      return { type: 'heading', attrs: { level }, content: content.length ? content : undefined };
    }

    case 'list': {
      if (node.listType === 'check') {
        // Convert to taskList
        const items = (node.children || []).map(child => convertCheckListItem(child));
        return { type: 'taskList', content: items };
      }
      const tag = node.listType === 'number' ? 'orderedList' : 'bulletList';
      const items = (node.children || []).map(child => {
        const content = convertChildren(child.children);
        return { type: 'listItem', content: content.length ? content : [{ type: 'paragraph' }] } as PMNode;
      });
      return { type: tag, content: items };
    }

    case 'listitem': {
      // Handled inside 'list' case
      const content = convertChildren(node.children);
      return { type: 'listItem', content: content.length ? content : [{ type: 'paragraph' }] };
    }

    case 'quote': {
      const content = convertChildren(node.children);
      return { type: 'blockquote', content: content.length ? content : [{ type: 'paragraph' }] };
    }

    case 'code': {
      // Lexical code block has code-highlight children with text
      const text = extractText(node);
      return { type: 'codeBlock', content: text ? [{ type: 'text', text }] : undefined };
    }

    case 'link': {
      // Convert link children to text with link mark
      const children = node.children || [];
      return children.map(child => {
        const converted = convertTextNode(child.type === 'text' ? child : { type: 'text', text: extractText(child) });
        const linkMark = { type: 'link', attrs: { href: node.url || '' } };
        converted.marks = [...(converted.marks || []), linkMark];
        return converted;
      });
    }

    case 'code-highlight': {
      return { type: 'text', text: node.text || '' };
    }

    case 'linebreak':
      return { type: 'hardBreak' };

    default:
      // Fallback: try to convert children
      if (node.children) {
        return convertChildren(node.children) as any;
      }
      return null;
  }
}

function convertCheckListItem(node: LexicalNode): PMNode {
  const checked = !!node.checked;
  const value = node.value || 1;
  // Store 3-state: unchecked (checked=false), done (checked=true, value!=3), cancelled (checked=true, value=3)
  const state = checked && value === 3 ? 'cancelled' : checked ? 'done' : 'unchecked';

  // TaskItem content must be block-level (paragraph wrapping inline content)
  const inlineContent = convertChildren(node.children);
  const content: PMNode[] = [];

  // If children are already block-level, use them directly; otherwise wrap in paragraph
  if (inlineContent.length > 0 && inlineContent.every(n => isBlockNode(n))) {
    content.push(...inlineContent);
  } else {
    content.push({ type: 'paragraph', content: inlineContent.length ? inlineContent : undefined });
  }

  return {
    type: 'taskItem',
    attrs: { checked, state },
    content,
  };
}

function isBlockNode(node: PMNode): boolean {
  return ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock'].includes(node.type);
}

function extractText(node: LexicalNode): string {
  if (node.type === 'text' || node.type === 'code-highlight') return node.text || '';
  if (node.children) return node.children.map(extractText).join('');
  return '';
}

/**
 * Parse a stored content string (Lexical AST JSON) and convert to TipTap JSON.
 * Returns null if unparseable.
 */
export function lexicalToTiptap(astString: string): PMNode | null {
  if (!astString) return null;
  try {
    let ast = JSON.parse(astString);

    // Handle double-wrapped JSON
    if (ast.text && typeof ast.text === 'string' && ast.text.startsWith('{"root"')) {
      try { ast = JSON.parse(ast.text); } catch { /* ignore */ }
    }

    if (!ast.root) return null;

    const result = convertNode(ast.root);
    if (Array.isArray(result)) return { type: 'doc', content: result };
    return result as PMNode;
  } catch {
    return null;
  }
}

/**
 * Convert TipTap JSON back to Lexical AST for storage.
 * This allows gradual migration — we still store as Lexical-compatible format.
 */
export function tiptapToLexical(doc: any): string {
  const root = convertPMToLexical(doc);
  return JSON.stringify({ root });
}

function convertPMToLexical(node: any): any {
  switch (node.type) {
    case 'doc':
      return {
        type: 'root',
        children: (node.content || []).map(convertPMToLexical),
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      };

    case 'paragraph': {
      let format = 0;
      if (node.attrs?.textAlign === 'right') format = 2;
      else if (node.attrs?.textAlign === 'center') format = 3;
      return {
        type: 'paragraph',
        children: convertPMChildren(node),
        direction: 'ltr',
        format,
        indent: 0,
        version: 1,
      };
    }

    case 'heading':
      return {
        type: 'heading',
        tag: `h${node.attrs?.level || 2}`,
        children: convertPMChildren(node),
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      };

    case 'bulletList':
      return {
        type: 'list',
        listType: 'bullet',
        children: (node.content || []).map(convertPMToLexical),
        direction: 'ltr',
        format: '',
        indent: 0,
        start: 1,
        tag: 'ul',
        version: 1,
      };

    case 'orderedList':
      return {
        type: 'list',
        listType: 'number',
        children: (node.content || []).map(convertPMToLexical),
        direction: 'ltr',
        format: '',
        indent: 0,
        start: 1,
        tag: 'ol',
        version: 1,
      };

    case 'taskList':
      return {
        type: 'list',
        listType: 'check',
        children: (node.content || []).map(convertPMToLexical),
        direction: 'ltr',
        format: '',
        indent: 0,
        start: 1,
        tag: 'ul',
        version: 1,
      };

    case 'listItem': {
      // Unwrap paragraph inside listItem
      const children = unwrapParagraphs(node);
      return {
        type: 'listitem',
        children,
        direction: 'ltr',
        format: '',
        indent: 0,
        value: 1,
        version: 1,
      };
    }

    case 'taskItem': {
      const state = node.attrs?.state || (node.attrs?.checked ? 'done' : 'unchecked');
      const checked = state !== 'unchecked';
      const value = state === 'cancelled' ? 3 : (checked ? 2 : 1);
      const children = unwrapParagraphs(node);
      return {
        type: 'listitem',
        checked,
        value,
        children,
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      };
    }

    case 'blockquote':
      return {
        type: 'quote',
        children: (node.content || []).map(convertPMToLexical),
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      };

    case 'codeBlock': {
      const text = (node.content || []).map((n: any) => n.text || '').join('');
      return {
        type: 'code',
        children: [{ type: 'code-highlight', text, version: 1, detail: 0, format: 0, mode: 'normal', style: '' }],
        direction: 'ltr',
        format: '',
        indent: 0,
        language: '',
        version: 1,
      };
    }

    case 'text': {
      let format = 0;
      const marks = node.marks || [];
      for (const mark of marks) {
        if (mark.type === 'bold') format |= 1;
        if (mark.type === 'italic') format |= 2;
        if (mark.type === 'strike') format |= 4;
        if (mark.type === 'underline') format |= 8;
        if (mark.type === 'code') format |= 16;
      }

      const linkMark = marks.find((m: any) => m.type === 'link');
      if (linkMark) {
        return {
          type: 'link',
          url: linkMark.attrs?.href || '',
          children: [{
            type: 'text',
            text: node.text || '',
            format,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          }],
          direction: 'ltr',
          format: '',
          indent: 0,
          rel: 'noopener',
          target: null,
          title: '',
          version: 1,
        };
      }

      return {
        type: 'text',
        text: node.text || '',
        format,
        detail: 0,
        mode: 'normal',
        style: '',
        version: 1,
      };
    }

    case 'hardBreak':
      return { type: 'linebreak', version: 1 };

    default:
      return {
        type: 'paragraph',
        children: convertPMChildren(node),
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      };
  }
}

function convertPMChildren(node: any): any[] {
  if (!node.content) return [];
  return node.content.map(convertPMToLexical);
}

function unwrapParagraphs(node: any): any[] {
  const content = node.content || [];
  // If there's a single paragraph, unwrap its children
  if (content.length === 1 && content[0].type === 'paragraph') {
    return convertPMChildren(content[0]);
  }
  return content.map(convertPMToLexical);
}
