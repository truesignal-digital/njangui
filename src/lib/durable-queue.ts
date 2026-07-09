export interface DurableQueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

export interface DurableQueueEntry {
  idempotencyKey: string;
}

/**
 * A tiny per-scope durable queue with serialized read-modify-write access.
 *
 * AsyncStorage has no compare-and-swap operation. Without this serializer,
 * rapid Meeting Mode taps can all read the same old array and overwrite one
 * another as their writes finish. Each scope gets its own promise chain so
 * separate rounds never block each other.
 */
export function createDurableQueue<T extends DurableQueueEntry>(
  storage: DurableQueueStorage,
  storageKey: (scopeId: string) => string
) {
  const tails = new Map<string, Promise<void>>();

  async function serialize<R>(scopeId: string, operation: () => Promise<R>): Promise<R> {
    const previous = tails.get(scopeId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(operation);
    const tail = run.then(
      () => undefined,
      () => undefined
    );
    tails.set(scopeId, tail);

    try {
      return await run;
    } finally {
      if (tails.get(scopeId) === tail) {
        tails.delete(scopeId);
      }
    }
  }

  async function read(scopeId: string): Promise<T[]> {
    const raw = await storage.getItem(storageKey(scopeId));
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('Durable queue data is not an array');
    }
    return parsed as T[];
  }

  return {
    load(scopeId: string): Promise<T[]> {
      return serialize(scopeId, () => read(scopeId));
    },

    enqueue(scopeId: string, entry: T): Promise<void> {
      return serialize(scopeId, async () => {
        const entries = await read(scopeId);
        if (entries.some((item) => item.idempotencyKey === entry.idempotencyKey)) {
          return;
        }
        entries.push(entry);
        await storage.setItem(storageKey(scopeId), JSON.stringify(entries));
      });
    },

    dequeue(scopeId: string, idempotencyKey: string): Promise<void> {
      return serialize(scopeId, async () => {
        const entries = await read(scopeId);
        const remaining = entries.filter((item) => item.idempotencyKey !== idempotencyKey);
        if (remaining.length === entries.length) return;

        if (remaining.length === 0 && storage.removeItem) {
          await storage.removeItem(storageKey(scopeId));
          return;
        }
        await storage.setItem(storageKey(scopeId), JSON.stringify(remaining));
      });
    },
  };
}
