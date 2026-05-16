export type NoteKind = 'note' | 'task';

// Derive the effective kind of an existing note from its properties.
// Explicit `kind` wins. For legacy entries without `kind`, any task-like
// signal (status, skill, recurrence, date) classifies as 'task'; entries
// with no signal stay as 'note' so they don't pollute task views.
//
// For brand-new entries (no initial properties at all), the editor picks
// its own default ('task') — see TweetEditor.
export function getNoteKind(props: any): NoteKind {
  if (!props || typeof props !== 'object') return 'note';
  if (props.kind === 'note' || props.kind === 'task') return props.kind;
  if (props.status && props.status !== 'none') return 'task';
  if (props.skill) return 'task';
  if (props.recurrence) return 'task';
  if (props.date) return 'task';
  return 'note';
}
