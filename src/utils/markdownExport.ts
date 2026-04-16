export interface NoteObj {
  id: string;
  parent_id: string | null;
  content: string; // Original, Tiptap JSON string
  created_at?: number;
  properties?: string;
  sort_key?: string;
  author_id?: string;
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
      // Root level (indentLevel === 0) is usually newest first (reverse chronological)
      // Children (indentLevel > 0) are usually oldest first (chronological)
      if (indentLevel === 0) {
        return b.sort_key.localeCompare(a.sort_key);
      }
      return a.sort_key.localeCompare(b.sort_key);
    }
    return indentLevel === 0 
      ? (b.created_at || 0) - (a.created_at || 0)
      : (a.created_at || 0) - (b.created_at || 0);
  });

  if (children.length === 0) return '';

  let markdown = '';
  // We use 4 spaces for child indentation, but if we format as lists (Logseq style), 
  // typical markdown indentation for nested lists is 2 or 4 spaces. 4 works well.
  const indent = '    '.repeat(indentLevel);

  for (let i = 0; i < children.length; i++) {
    const note = children[i];
    
    // Parse metadata
    let propsObj: any = {};
    if (note.properties) {
      try { propsObj = JSON.parse(note.properties); } catch {}
    }

    // Build standard properties block
    const propertiesLines: string[] = [];
    if (note.id) propertiesLines.push(`id:: ${note.id}`);
    if (note.created_at) propertiesLines.push(`created_at:: ${new Date(note.created_at).toISOString()}`);
    if (note.author_id) propertiesLines.push(`author:: ${note.author_id.substring(0, 10)}...`);
    if (propsObj.status && propsObj.status !== 'none') propertiesLines.push(`status:: ${propsObj.status}`);
    if (propsObj.date) propertiesLines.push(`due_date:: ${propsObj.date}`);

    const textContent = tiptapToMarkdown(note.content).trim();
    // Split into lines so we can prepend the Logseq-style bullet
    const textBlocks = textContent.split('\n');
    
    // First line gets the bullet
    let noteText = `- ${textBlocks[0] || ''}`;
    // Subsequent lines are indented by 2 spaces to align with the bullet text
    for (let j = 1; j < textBlocks.length; j++) {
      noteText += `\n  ${textBlocks[j]}`;
    }

    // Add properties
    for (const pLine of propertiesLines) {
      noteText += `\n  ${pLine}`;
    }
    
    // Apply the tree hierarchy indent to the entire block
    const blockLines = noteText.split('\n');
    const indentedText = blockLines.map(line => line.trimEnd() ? `${indent}${line}` : indent).join('\n');
    
    markdown += indentedText + '\n\n';

    // Format descendants
    const descendantsMarkdown = formatNotesAsMarkdown(notes, note.id, indentLevel + 1);
    if (descendantsMarkdown) {
      markdown += descendantsMarkdown;
    }

    // Root-level separator (optional, but requested by user for siblings)
    if (indentLevel === 0 && i < children.length - 1) {
      markdown += '---\n\n';
    }
  }

  return markdown;
}
