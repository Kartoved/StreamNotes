import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';

export interface BacklinkSuggestionCallbacks {
  onOpen: (props: {
    query: string;
    clientRect: (() => DOMRect | null) | null;
    command: (item: { id: string; title: string }) => void;
  }) => void;
  onUpdate: (props: {
    query: string;
    clientRect: (() => DOMRect | null) | null;
  }) => void;
  onClose: () => void;
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export interface BacklinkCallbacksRef {
  current: BacklinkSuggestionCallbacks;
}

export function createBacklinkExtension(callbacksRef: BacklinkCallbacksRef) {
  return Extension.create({
    name: 'backlink',

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '[[',
          allowSpaces: true,
          startOfLine: false,
          items: () => [],
          command({ editor, range, props }) {
            const item = props as { id: string; title: string };
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent({
                type: 'text',
                marks: [{ type: 'link', attrs: { href: `note://${item.id}` } }],
                text: item.title,
              })
              // Drop the link mark so the trailing space (and any subsequent typing) stays clean
              .command(({ tr, state }) => {
                tr.removeStoredMark(state.schema.marks.link);
                return true;
              })
              .insertContent(' ')
              .run();
          },
          render: () => ({
            onStart(props) {
              callbacksRef.current.onOpen({
                query: props.query,
                clientRect: props.clientRect ?? null,
                command: props.command,
              });
            },
            onUpdate(props) {
              callbacksRef.current.onUpdate({
                query: props.query,
                clientRect: props.clientRect ?? null,
              });
            },
            onExit() {
              callbacksRef.current.onClose();
            },
            onKeyDown({ event }) {
              return callbacksRef.current.onKeyDown(event);
            },
          }),
        }),
      ];
    },
  });
}
