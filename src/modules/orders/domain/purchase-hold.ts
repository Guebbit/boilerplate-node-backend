/**
 * @module
 * When a buyer's own cancellations amount to a purchase hold. Pure: the times, the limit and the
 * window are arguments, so the unit suite needs no clock and no database.
 */

import { DAY_MS } from '@domain-primitives/time';

/**
 * The instant a hold ends, when `cancelTimes` reach `limit`; otherwise `undefined`.
 *
 * `cancelTimes` are the cancellations to count, already narrowed to those after the last hold or
 * staff lift. Only the ones inside `windowDays` of `now` count. The hold lasts until the count would
 * fall back under the limit: the cancellation that has to age out is the `(count - limit + 1)`-th
 * oldest, so with exactly `limit` of them that is the oldest plus the window.
 *
 * @param cancelTimes - the buyer's own cancellations, in any order
 * @param limit - how many pause checkout
 * @param windowDays - how long a cancellation counts for
 * @param now - the instant to count from
 */
export const purchaseHoldUntil = (
    cancelTimes: readonly Date[],
    limit: number,
    windowDays: number,
    now: Date
): Date | undefined => {
    const windowMs = windowDays * DAY_MS;
    const counted = cancelTimes
        .map((time) => time.getTime())
        .filter((time) => time > now.getTime() - windowMs)
        .toSorted((a, b) => a - b);
    if (counted.length < limit) return undefined;

    // The index exists: `counted.length >= limit >= 1` was checked above.
    return new Date(counted[counted.length - limit] + windowMs);
};
