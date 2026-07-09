import { describe, expect, test } from 'bun:test';
import {
  createDurableQueue,
  type DurableQueueStorage,
} from './durable-queue';

type Entry = {
  idempotencyKey: string;
  recordId: string;
};

function delayedMemoryStorage() {
  const values = new Map<string, string>();
  const storage: DurableQueueStorage = {
    async getItem(key) {
      await Promise.resolve();
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      await Promise.resolve();
      values.set(key, value);
    },
    async removeItem(key) {
      await Promise.resolve();
      values.delete(key);
    },
  };
  return { storage, values };
}

describe('createDurableQueue', () => {
  test('preserves 15 concurrent taps in one round', async () => {
    const { storage } = delayedMemoryStorage();
    const queue = createDurableQueue<Entry>(storage, (roundId) => `round:${roundId}`);

    await Promise.all(
      Array.from({ length: 15 }, (_, index) =>
        queue.enqueue('round-1', {
          idempotencyKey: `tap-${index}`,
          recordId: `record-${index}`,
        })
      )
    );

    const entries = await queue.load('round-1');
    expect(entries).toHaveLength(15);
    expect(new Set(entries.map((entry) => entry.idempotencyKey)).size).toBe(15);
  });

  test('deduplicates a replay with the same idempotency key', async () => {
    const { storage } = delayedMemoryStorage();
    const queue = createDurableQueue<Entry>(storage, (roundId) => `round:${roundId}`);
    const entry = { idempotencyKey: 'tap-1', recordId: 'record-1' };

    await Promise.all([
      queue.enqueue('round-1', entry),
      queue.enqueue('round-1', entry),
      queue.enqueue('round-1', entry),
    ]);

    expect(await queue.load('round-1')).toEqual([entry]);
  });

  test('serializes enqueue and dequeue without resurrecting removed taps', async () => {
    const { storage, values } = delayedMemoryStorage();
    const queue = createDurableQueue<Entry>(storage, (roundId) => `round:${roundId}`);

    await queue.enqueue('round-1', {
      idempotencyKey: 'old',
      recordId: 'record-old',
    });
    await Promise.all([
      queue.dequeue('round-1', 'old'),
      queue.enqueue('round-1', {
        idempotencyKey: 'new',
        recordId: 'record-new',
      }),
    ]);

    expect(await queue.load('round-1')).toEqual([
      { idempotencyKey: 'new', recordId: 'record-new' },
    ]);
    expect(values.has('round:round-1')).toBe(true);
  });

  test('does not let a failed write poison later operations', async () => {
    let shouldFail = true;
    const values = new Map<string, string>();
    const storage: DurableQueueStorage = {
      async getItem(key) {
        return values.get(key) ?? null;
      },
      async setItem(key, value) {
        if (shouldFail) {
          shouldFail = false;
          throw new Error('disk full');
        }
        values.set(key, value);
      },
    };
    const queue = createDurableQueue<Entry>(storage, (roundId) => `round:${roundId}`);

    await expect(
      queue.enqueue('round-1', { idempotencyKey: 'failed', recordId: 'record-failed' })
    ).rejects.toThrow('disk full');
    await queue.enqueue('round-1', {
      idempotencyKey: 'saved',
      recordId: 'record-saved',
    });

    expect(await queue.load('round-1')).toEqual([
      { idempotencyKey: 'saved', recordId: 'record-saved' },
    ]);
  });

  test('retains transient failures and replays every intended tap exactly once', async () => {
    const { storage } = delayedMemoryStorage();
    const queue = createDurableQueue<Entry>(storage, (roundId) => `round:${roundId}`);
    const entries = Array.from({ length: 15 }, (_, index) => ({
      idempotencyKey: `tap-${index}`,
      recordId: `record-${index}`,
    }));
    await Promise.all(entries.map((entry) => queue.enqueue('round-1', entry)));

    const applied = new Set<string>();
    let interrupted = true;
    const firstDrain = await queue.drain(
      'round-1',
      async (entry) => {
        if (interrupted && Number(entry.recordId.split('-')[1]) >= 7) {
          throw new Error('network unavailable');
        }
        applied.add(entry.idempotencyKey);
      },
      (error) => error instanceof Error && /network/i.test(error.message)
    );

    expect(firstDrain).toEqual({ processed: 7, discarded: 0, retained: 8 });
    expect(await queue.load('round-1')).toHaveLength(8);

    interrupted = false;
    const replay = await queue.drain(
      'round-1',
      async (entry) => {
        applied.add(entry.idempotencyKey);
      },
      () => false
    );

    expect(replay).toEqual({ processed: 8, discarded: 0, retained: 0 });
    expect(await queue.load('round-1')).toEqual([]);
    expect(applied.size).toBe(15);
  });

  test('discards terminal failures so they do not loop forever', async () => {
    const { storage } = delayedMemoryStorage();
    const queue = createDurableQueue<Entry>(storage, (roundId) => `round:${roundId}`);
    await queue.enqueue('round-1', {
      idempotencyKey: 'stale',
      recordId: 'record-stale',
    });

    const result = await queue.drain(
      'round-1',
      async () => {
        throw new Error('record already cancelled');
      },
      (error) => error instanceof Error && /network/i.test(error.message)
    );

    expect(result).toEqual({ processed: 0, discarded: 1, retained: 0 });
    expect(await queue.load('round-1')).toEqual([]);
  });
});
