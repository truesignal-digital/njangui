import AsyncStorage from '@react-native-async-storage/async-storage';

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

const keyFor = (roundId: string) => `njangi-meeting-queue-${roundId}`;

export async function loadQueue(roundId: string): Promise<QueuedTap[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(roundId));
    return raw ? (JSON.parse(raw) as QueuedTap[]) : [];
  } catch {
    return [];
  }
}

export async function enqueueTap(
  roundId: string,
  tap: QueuedTap
): Promise<void> {
  const queue = await loadQueue(roundId);
  if (!queue.some((t) => t.idempotencyKey === tap.idempotencyKey)) {
    queue.push(tap);
  }
  await AsyncStorage.setItem(keyFor(roundId), JSON.stringify(queue));
}

export async function dequeueTap(
  roundId: string,
  idempotencyKey: string
): Promise<void> {
  const queue = await loadQueue(roundId);
  await AsyncStorage.setItem(
    keyFor(roundId),
    JSON.stringify(queue.filter((t) => t.idempotencyKey !== idempotencyKey))
  );
}
