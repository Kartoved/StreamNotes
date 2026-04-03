import { Plugin, PluginKey } from '@tiptap/pm/state';

export const backlinkPluginKey = new PluginKey('backlink');

export function createBacklinkPlugin(
  onActivate: (query: string, pos: { from: number; to: number }) => void,
  onDeactivate: () => void,
) {
  return new Plugin({
    key: backlinkPluginKey,
    state: {
      init: () => ({ active: false, query: '', from: 0, to: 0 }),
      apply(tr, prev) {
        const meta = tr.getMeta(backlinkPluginKey);
        if (meta) return meta;
        if (!prev.active) return prev;
        // If selection changed, re-check
        const { $head } = tr.selection;
        const textBefore = $head.parent.textContent.slice(0, $head.parentOffset);
        const match = /\[\[([^\]]*)$/.exec(textBefore);
        if (match) {
          return { active: true, query: match[1], from: $head.pos - match[1].length - 2, to: $head.pos };
        }
        return { active: false, query: '', from: 0, to: 0 };
      },
    },
    props: {
      handleTextInput(view, from, to, text) {
        const { state } = view;
        const $head = state.selection.$head;
        const textBefore = $head.parent.textContent.slice(0, $head.parentOffset) + text;
        const match = /\[\[([^\]]*)$/.exec(textBefore);
        if (match) {
          setTimeout(() => {
            onActivate(match[1], { from: from - match[1].length - 1, to: to + text.length });
          }, 0);
        } else {
          onDeactivate();
        }
        return false;
      },
      handleKeyDown(view, event) {
        const pluginState = backlinkPluginKey.getState(view.state);
        if (pluginState?.active && event.key === 'Escape') {
          onDeactivate();
          return true;
        }
        return false;
      },
    },
  });
}
