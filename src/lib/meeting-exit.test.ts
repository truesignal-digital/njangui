import { describe, expect, test } from 'bun:test';

import { meetingExitAction, unsentTapCount } from './meeting-exit';

describe('meetingExitAction', () => {
  test.each([
    [{ pending: 0, syncing: 0, editorOpen: false }, 'leave'],
    [{ pending: 2, syncing: 0, editorOpen: false }, 'confirm'],
    [{ pending: 0, syncing: 1, editorOpen: false }, 'confirm'],
    [{ pending: 3, syncing: 3, editorOpen: false }, 'confirm'],
    [{ pending: 0, syncing: 0, editorOpen: true }, 'close-editor'],
    [{ pending: 2, syncing: 1, editorOpen: true }, 'close-editor'],
  ] as const)('%o -> %s', (state, expected) => {
    expect(meetingExitAction(state)).toBe(expected);
  });
});

describe('unsentTapCount', () => {
  test('in-flight taps are already in the queue, so counts do not add', () => {
    expect(unsentTapCount({ pending: 2, syncing: 2 })).toBe(2);
    expect(unsentTapCount({ pending: 3, syncing: 1 })).toBe(3);
  });

  test('a tap in flight before the queue count refreshes still counts', () => {
    expect(unsentTapCount({ pending: 0, syncing: 1 })).toBe(1);
  });
});
