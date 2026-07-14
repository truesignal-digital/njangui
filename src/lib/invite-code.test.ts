import { describe, expect, test } from 'bun:test';

import { extractInviteCode, inviteCodeCells } from './invite-code';

describe('invite code parsing', () => {
  test.each([
    ['K7M2PQ', 'K7M2PQ'],
    ['njangi://j/K7M2PQ', 'K7M2PQ'],
    ['https://njangi.app/j/K7M2PQ', 'K7M2PQ'],
    ['Join us. Invite code: K7M2PQ. Money never passes through the app.', 'K7M2PQ'],
  ])('extracts %s', (input, expected) => {
    expect(extractInviteCode(input)).toBe(expected);
  });

  test('rejects incomplete text', () => {
    expect(extractInviteCode('K7M')).toBeNull();
    expect(inviteCodeCells('k7m')).toEqual(['K', '7', 'M', '', '', '']);
  });
});
