/**
 * @module
 * The single-use record ALTCHA checks a solved challenge against, so one solution cannot be spent
 * twice. Two steps, in this order, around altcha-lib's `verify`:
 *
 * Peek:   {@link isSpent} looks, records nothing. A spent id is refused before the verify is paid.
 * Claim:  {@link claim} records the id, and only runs once `verify` said `verified: true`.
 *
 * Nothing unsigned ever writes: the id is read from the payload before it is trusted, so a claim
 * made earlier would let an attacker fill memory (and Redis) with random ids.
 */

import { claimLimitsKey, isLimitsKeyClaimed } from '../limits-redis';

/** How long a spent record must live: past this, the challenge itself has expired anyway. */
const RECORD_TTL_SECONDS = 600;

/**
 * The floor under the `limits` Redis: with no Redis configured (or one that fails) single-use is
 * still enforced inside ONE process, and Redis widens that across `cluster.ts`'s worker fork when
 * it is reachable. The claims live on the `limits` instance, never the cache's: the cache evicts
 * under pressure, and an evicted claim is a replayable solution.
 *
 * Insertion order IS expiry order (every record has the same TTL), which {@link sweepExpired}
 * relies on.
 */
const spentLocally = new Map<string, number>();

/**
 * Drops records past their own expiry, so a long-lived process does not leak memory.
 *
 * Stops at the first live entry: the Map iterates in insertion order and every record shares one
 * TTL, so nothing after a live entry can be expired. Amortised O(1) per call.
 */
const sweepExpired = (): void => {
    const now = Date.now();
    for (const [key, expiresAt] of spentLocally) {
        if (expiresAt > now) return;
        spentLocally.delete(key);
    }
};

/** Namespaced so a challenge record can never collide with another cache user's key. */
const keyOf = (key: string): string => `antibot:spent:${key}`;

/**
 * Longest challenge id this store looks up or records. A real one is a short nonce; the id is
 * read from the payload before its signature is checked, so an attacker could otherwise make each
 * lookup, and each record, kilobytes long.
 */
const MAX_KEY_LENGTH = 256;

/**
 * Whether the in-process floor holds a live record of `key`.
 *
 * @param key - the namespaced key
 */
const spentHere = (key: string): boolean => {
    sweepExpired();
    return spentLocally.has(key);
};

/**
 * Claim `key` locally, synchronously — the in-process half of the single-use check.
 *
 * @returns whether this call was the first to claim it
 */
const claimLocally = (key: string): boolean => {
    if (spentHere(key)) return false;
    spentLocally.set(key, Date.now() + RECORD_TTL_SECONDS * 1000);
    return true;
};

/**
 * Whether a challenge id was already used — read-only, so an unverified payload leaves no trace.
 *
 * @param id - the challenge id the payload carries
 * @returns true when it was spent (here, or in Redis); an over-long id counts as spent
 */
export const isSpent = (id: string): Promise<boolean> => {
    if (id.length > MAX_KEY_LENGTH) return Promise.resolve(true);
    if (spentHere(keyOf(id))) return Promise.resolve(true);
    return isLimitsKeyClaimed(keyOf(id));
};

/**
 * Record a challenge id as used, atomically: the local map first (synchronous, so two requests in
 * one process cannot both win), then Redis `SET NX`, which settles it across workers. Call it only
 * for a payload `verify` accepted.
 *
 * @param id - the challenge id the payload carries
 * @returns true for the one caller that got the claim; false for every later one
 */
export const claim = (id: string): Promise<boolean> => {
    if (id.length > MAX_KEY_LENGTH) return Promise.resolve(false);
    if (!claimLocally(keyOf(id))) return Promise.resolve(false);
    // `unavailable` (no Redis) keeps the local claim as the answer: single-use within this
    // process, the same floor as before Redis is reachable.
    return claimLimitsKey(keyOf(id), RECORD_TTL_SECONDS).then((result) => result !== 'taken');
};
