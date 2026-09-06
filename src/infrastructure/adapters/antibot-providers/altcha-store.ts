/**
 * @module
 * The single-use record ALTCHA checks a solved challenge against, so one solution cannot be spent
 * twice. Shaped as the library's own `Store` interface and backed by this app's cache.
 */

import { getCacheValue, setCacheValue } from '../cache';

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
 * ALTCHA's `Store` contract: `get` answers whether this challenge was already used, `set` records
 * that it now has been. The library calls both around its own verification.
 * https://github.com/altcha-org/altcha-lib
 */
export const altchaStore = {
    get: (key: string): Promise<unknown> => {
        sweepExpired();
        if (spentLocally.has(keyOf(key))) return Promise.resolve(true);
        return getCacheValue(keyOf(key)).then((value) => value !== undefined);
    },

    set: (key: string, value: boolean): Promise<unknown> => {
        spentLocally.set(keyOf(key), Date.now() + RECORD_TTL_SECONDS * 1000);
        return setCacheValue(keyOf(key), String(value), RECORD_TTL_SECONDS);
    }
};
