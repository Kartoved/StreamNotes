import TaskItem from '@tiptap/extension-task-item';
import { mergeAttributes } from '@tiptap/core';

// Extends the default TaskItem to support 3 states: unchecked → done → cancelled
export const ThreeStateTaskItem = TaskItem.extend({
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
