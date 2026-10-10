export type MeetingExitAction = 'close-editor' | 'confirm' | 'leave';

type TapCounts = { pending: number; syncing: number };

/** Taps are enqueued before their mutation fires, so in-flight taps are a subset of the queue. */
export function unsentTapCount({ pending, syncing }: TapCounts) {
  return Math.max(pending, syncing);
}

export function meetingExitAction({
  pending,
  syncing,
  editorOpen,
}: TapCounts & { editorOpen: boolean }): MeetingExitAction {
  if (editorOpen) return 'close-editor';
  if (unsentTapCount({ pending, syncing }) > 0) return 'confirm';
  return 'leave';
}
