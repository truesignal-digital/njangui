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
});
