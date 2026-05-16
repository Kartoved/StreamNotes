export type NoteKind = 'note' | 'task';

// Derive the effective kind of a note from its properties.
// undefined return = "inbox" (unsorted, awaiting classification).
//
// Legacy notes (created before the kind field existed) are inferred:
// any task-like signal (status, skill, recurrence, date) promotes them to
// 'task'. Otherwise they stay as inbox until the user classifies them.
export function getNoteKind(props: any): NoteKind | undefined {
  if (!props || typeof props !== 'object') return undefined;
  if (props.kind === 'note' || props.kind === 'task') return props.kind;
  if (props.status && props.status !== 'none') return 'task';
  if (props.skill) return 'task';
  if (props.recurrence) return 'task';
  if (props.date) return 'task';
  return undefined;
}
