export interface NoteObj {
  id: string;
  parent_id: string | null;
  content: string; // Original, Tiptap JSON string
  created_at?: number;
  properties?: string;
  sort_key?: string;
}

export function tiptapToMarkdown(node: any): string {
  if (!node) return '';

  if (typeof node === 'string') {
    try { node = JSON.parse(node); } catch { return node; }
  }

  const renderContent = (children: any[]) => {
    return (children || []).map(tiptapToMarkdown).join('');
  };

  switch (node.type) {
    case 'doc':
      return renderContent(node.content);
    
    case 'paragraph':
      return renderContent(node.content) + '\n\n';

    case 'text': {
      let text = node.text || '';
      const marks = node.marks || [];
      const hasMark = (type: string) => marks.some((m: any) => m.type === type);
      const linkMark = marks.find((m: any) => m.type === 'link');

      if (hasMark('bold')) text = `**${text}**`;
      if (hasMark('italic')) text = `*${text}*`;
      if (hasMark('strike')) text = `~~${text}~~`;
      if (hasMark('code')) text = `\`${text}\``;
      if (linkMark) {
        const href = linkMark.attrs?.href || '';
        text = `[${text}](${href})`;
      }
      return text;
    }

    case 'heading': {
      const level = Math.min(Math.max(node.attrs?.level || 1, 1), 6);
      return '#'.repeat(level) + ' ' + renderContent(node.content) + '\n\n';
    }

    case 'codeBlock': {
      const lang = node.attrs?.language || '';
      return '```' + lang + '\n' + renderContent(node.content) + '\n```\n\n';
    }

    case 'blockquote':
      return renderContent(node.content).split('\n').map((line: string) => line ? `> ${line}` : '>').join('\n') + '\n';

    case 'bulletList':
      return (node.content || []).map((li: any) => `- ${renderContent(li.content)}`).join('');

    case 'orderedList':
      return (node.content || []).map((li: any, i: number) => `${i + 1}. ${renderContent(li.content)}`).join('');

    case 'taskList':
      return renderContent(node.content);

    case 'taskItem': {
      const state = node.attrs?.state;
      let check = '[ ]';
      if (state === 'done') check = '[x]';
      if (state === 'cancelled') check = '[-]';
      return `- ${check} ${renderContent(node.content)}`;
    }

    case 'image': {
      const src = node.attrs?.src || '';
      const alt = node.attrs?.alt || '';
      const title = node.attrs?.title || '';
      return `![${alt}](${src}${title ? ` "${title}"` : ''})`;
    }

    case 'hardBreak':
      return '\n';

    default:
      // Fallback for unknown nodes
      if (node.content) return renderContent(node.content);
      return '';
  }
}

export function formatNotesAsMarkdown(notes: NoteObj[], rootId: string | null = null, indentLevel: number = 0): string {
  // Sort children by sort_key, or fall back to created_at
  const children = notes.filter(n => n.parent_id === rootId).sort((a, b) => {
    if (a.sort_key && b.sort_key) {
      return a.sort_key.localeCompare(b.sort_key);
    }
    return (a.created_at || 0) - (b.created_at || 0);
  });

  if (children.length === 0) return '';

  let markdown = '';
  const indent = '    '.repeat(indentLevel); // 4 spaces for Python-like indent

  for (let i = 0; i < children.length; i++) {
    const note = children[i];
    const textBlocks = tiptapToMarkdown(note.content).trim().split('\n');
    
    // Apply indent to each line
    const indentedText = textBlocks.map(line => line ? `${indent}${line}` : indent).join('\n');
    markdown += indentedText + '\n\n';

    // Format descendants
    const descendantsMarkdown = formatNotesAsMarkdown(notes, note.id, indentLevel + 1);
    if (descendantsMarkdown) {
      markdown += descendantsMarkdown;
    }

    // Siblings separator ONLY at root level (indentLevel === 0), unless it's the last element
    if (indentLevel === 0 && i < children.length - 1) {
      markdown += '---\n\n';
    }
  }

  return markdown;
}
