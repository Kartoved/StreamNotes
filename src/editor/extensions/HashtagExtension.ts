import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';

export interface HashtagCallbacks {
  onOpen: (props: {
    query: string;
    clientRect: (() => DOMRect | null) | null;
    command: (tag: string) => void;
  }) => void;
  onUpdate: (props: {
    query: string;
    clientRect: (() => DOMRect | null) | null;
    command: (tag: string) => void;
  }) => void;
  onClose: () => void;
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export function createHashtagExtension(callbacksRef: { current: HashtagCallbacks }) {
  return Extension.create({
    name: 'hashtag-suggestion',

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          pluginKey: new PluginKey('hashtag-suggestion'),
          char: '#',
          allowSpaces: false,
          startOfLine: false,
          items: () => [],
          command({ editor, range, props }) {
            const tag = props as unknown as string;
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent(tag + ' ')
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
                command: props.command,
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
