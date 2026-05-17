export type NoteKind = 'note' | 'task';

// Derive the effective kind of an existing note from its properties.
// status='note' is the new canonical marker. Legacy entries may use
// kind='note' or status='none' — all treated as non-task.
export function getNoteKind(props: any): NoteKind {
  if (!props || typeof props !== 'object') return 'note';
  if (props.status === 'note') return 'note';
  if (props.kind === 'note') return 'note';
  if (props.kind === 'task') return 'task';
  if (props.status && props.status !== 'none') return 'task';
  if (props.skill) return 'task';
  if (props.recurrence) return 'task';
  if (props.date) return 'task';
  return 'note';
}
