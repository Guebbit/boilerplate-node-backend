/**
 * @module
 * The single-use record ALTCHA checks a solved challenge against, so one solution cannot be spent
 * twice. Shaped as the library's own `Store` interface and backed by this app's cache.
 */

import { claimCacheKey } from '../cache';

/** How long a spent record must live: past this, the challenge itself has expired anyway. */
const RECORD_TTL_SECONDS = 600;

/**
 * The floor under the shared cache: `adapters/cache.ts` is "an optimisation, never a dependency"
 * and quietly no-ops with no Redis configured — fine for a byte cache, a silent hole for
 * single-use enforcement. This is the same floor `rate-limit-store.ts` falls back to: a replay is
 * always caught within ONE process, and Redis widens that across `cluster.ts`'s worker fork when
 * it is reachable.
 */
const spentLocally = new Map<string, number>();

/** Drops records past their own expiry, so a long-lived process does not leak memory. */
const sweepExpired = (): void => {
    const now = Date.now();
    for (const [key, expiresAt] of spentLocally) if (expiresAt <= now) spentLocally.delete(key);
};

/** Namespaced so a challenge record can never collide with another cache user's key. */
const keyOf = (key: string): string => `antibot:spent:${key}`;

/**
 * Longest challenge id this store records. A real one is a short nonce; the id is read from the
 * unverified payload, so an attacker could otherwise make each record kilobytes long.
 */
const MAX_KEY_LENGTH = 256;

/**
 * Claim `key` locally, synchronously — the in-process half of the single-use check.
 *
 * @returns whether this call was the first to claim it
 */
const claimLocally = (key: string): boolean => {
    sweepExpired();
    if (spentLocally.has(key)) return false;
    spentLocally.set(key, Date.now() + RECORD_TTL_SECONDS * 1000);
    return true;
};

/**
 * ALTCHA's `Store` contract: `get` answers whether this challenge was already used, `set` records
 * that it now has been. https://github.com/altcha-org/altcha-lib
 *
 * The library awaits `get`, then calls `set`. Two requests carrying the same solution could both
 * pass `get` before either reached `set`, so `get` itself CLAIMS the id — locally at once, then in
 * Redis with `SET NX` — and `set` has nothing left to do. The first caller gets "unused"; every
 * other caller, in any process, gets "used".
 */
export const altchaStore = {
    get: (key: string): Promise<unknown> => {
        if (key.length > MAX_KEY_LENGTH) return Promise.resolve(true);
        if (!claimLocally(keyOf(key))) return Promise.resolve(true);
        // `unavailable` (no Redis) keeps the local claim as the answer: single-use within this
        // process, the same floor as before Redis is reachable.
        return claimCacheKey(keyOf(key), RECORD_TTL_SECONDS).then((claim) => claim === 'taken');
    },

    set: (): Promise<unknown> => Promise.resolve()
};
