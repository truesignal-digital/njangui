import * as Crypto from 'expo-crypto';

/**
 * Client-generated idempotency key for paymentRecords.claim (I-11).
 *
 * Contract: generate ONCE per logical tap and hold it in component state —
 * the SAME key is re-sent on retry so an offline replay no-ops instead of
 * double-claiming. Never regenerate per render or per retry.
 */
export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}
