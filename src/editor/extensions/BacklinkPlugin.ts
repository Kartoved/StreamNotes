import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Extension } from '@tiptap/core';

export const backlinkPluginKey = new PluginKey('backlink');

export interface BacklinkState {
  active: boolean;
  query: string;
  from: number;
  to: number;
}

function getMatchFromTr(tr: any): RegExpMatchArray | null {
  const { $head } = tr.selection;
  const textBefore = $head.parent.textContent.slice(0, $head.parentOffset);
  return /\[\[([^\]]*)$/.exec(textBefore);
}

export const BacklinkExtension = Extension.create({
  name: 'backlinkDropdown',

  addOptions() {
    return {
      onActivate: (_query: string, _range: { from: number; to: number }) => {},
      onDeactivate: () => {},
    };
  },

  addProseMirrorPlugins() {
    const { onActivate, onDeactivate } = this.options;

    // Track dismissal: if user pressed Escape, suppress until query changes
    let dismissedAt: string | null = null; // stores the query text at dismiss time

    return [
      new Plugin({
        key: backlinkPluginKey,

        state: {
          init: (): BacklinkState => ({ active: false, query: '', from: 0, to: 0 }),
          apply(tr, _prev): BacklinkState {
            const match = getMatchFromTr(tr);
            if (!match) {
              dismissedAt = null; // reset dismissal when [[ leaves text
              return { active: false, query: '', from: 0, to: 0 };
            }
            const { $head } = tr.selection;
            const query = match[1];
            // Re-open if user typed more than was present at dismissal
            if (dismissedAt !== null && query !== dismissedAt) {
              dismissedAt = null;
            }
            if (dismissedAt !== null) {
              return { active: false, query, from: $head.pos - query.length - 2, to: $head.pos };
            }
            return {
              active: true,
              query,
              from: $head.pos - query.length - 2,
              to: $head.pos,
            };
          },
        },

        view() {
          return {
            update(view, prevState) {
              const prev = backlinkPluginKey.getState(prevState) as BacklinkState;
              const next = backlinkPluginKey.getState(view.state) as BacklinkState;
              if (!prev || !next) return;

              const wasActive = prev.active;
              const isNowActive = next.active;

              if (isNowActive && (!wasActive || prev.query !== next.query || prev.from !== next.from)) {
                onActivate(next.query, { from: next.from, to: next.to });
              } else if (!isNowActive && wasActive) {
                onDeactivate();
              }
            },
          };
        },

        props: {
          handleKeyDown(view, event) {
            const st = backlinkPluginKey.getState(view.state) as BacklinkState | undefined;
            if (!st?.active) return false;
            if (['Enter', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
              return true;
            }
            if (event.key === 'Escape') {
              dismissedAt = st.query; // suppress until query changes
              onDeactivate();
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
