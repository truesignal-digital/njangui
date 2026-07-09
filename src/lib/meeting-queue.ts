import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDurableQueue } from './durable-queue';
import { storageKeys } from './storage-keys';

/**
 * Meeting Mode's durable tap queue — THE one offline exception in the app
 * (docs/03 §D, 05 Week 4): Android kills backgrounded apps aggressively on
 * ≤2GB devices and a treasurer WILL switch to WhatsApp mid-réunion. Every
 * roll-call tap is persisted BEFORE the mutation fires and removed after
 * the server acknowledges; on next open the queue replays idempotently
 * (same key per logical tap — replays no-op server-side, I-11).
 */
export interface QueuedTap {
  recordId: string;
  idempotencyKey: string;
  action: 'claim' | 'confirm';
  amount?: number;
  queuedAt: number;
}

const keyFor = storageKeys.meetingQueue;
const queue = createDurableQueue<QueuedTap>(AsyncStorage, keyFor);

export async function loadQueue(roundId: string): Promise<QueuedTap[]> {
  try {
    return await queue.load(roundId);
  } catch {
    return [];
  }
}

export async function enqueueTap(
  roundId: string,
  tap: QueuedTap
): Promise<void> {
  await queue.enqueue(roundId, tap);
}

export async function dequeueTap(
  roundId: string,
  idempotencyKey: string
): Promise<void> {
  await queue.dequeue(roundId, idempotencyKey);
}

export function isTransientMeetingSyncError(error: unknown): boolean {
  return error instanceof Error && /network|fetch/i.test(error.message);
}

export async function replayQueue(
  roundId: string,
  handlers: {
    claim(tap: QueuedTap): Promise<void>;
    confirm(tap: QueuedTap): Promise<void>;
  }
) {
  return await queue.drain(
    roundId,
    async (tap) => {
      if (tap.action === 'claim') {
        await handlers.claim(tap);
      } else {
        await handlers.confirm(tap);
      }
    },
    isTransientMeetingSyncError
  );
}
