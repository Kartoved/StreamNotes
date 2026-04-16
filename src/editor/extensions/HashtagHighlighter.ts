import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const HashtagHighlighter = Extension.create({
  name: 'hashtagHighlighter',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('hashtagHighlighter'),
        props: {
          decorations(state) {
            const { doc } = state;
            const decorations: Decoration[] = [];
            const regex = /#[\w\u0400-\u04FF][\w\u0400-\u04FF0-9_]*/gi;

            doc.descendants((node, pos) => {
              if (node.isText && node.text) {
                // Skip if parent is a code block or if it has a code mark
                const parent = doc.resolve(pos).parent;
                if (parent.type.name === 'codeBlock') return false;
                if (node.marks.some(mark => mark.type.name === 'code')) return false;

                let match;
                while ((match = regex.exec(node.text)) !== null) {
                  const start = pos + match.index;
                  const end = start + match[0].length;
                  decorations.push(
                    Decoration.inline(start, end, {
                      class: 'hashtag-decorator',
                      'data-hashtag': match[0],
                    })
                  );
                }
              }
              return true;
            });

            return DecorationSet.create(doc, decorations);
          },
          handleClick(view, pos, event) {
            const target = event.target as HTMLElement;
            if (target && target.classList.contains('hashtag-decorator')) {
              const tag = target.getAttribute('data-hashtag');
              if (tag) {
                // If Ctrl/Cmd is pressed, or on mobile, trigger search
                if (event.ctrlKey || event.metaKey || window.innerWidth <= 640) {
                  event.preventDefault();
                  event.stopPropagation();
                  (window as any).onHashtagClick?.(tag);
                  return true;
                }
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});
