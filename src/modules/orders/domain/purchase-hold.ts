/**
 * @module
 * When a buyer's own cancellations amount to a purchase hold. Pure: the times, the limit and the
 * window are arguments, so the unit suite needs no clock and no database.
 */

import { DAY_MS } from '@domain-primitives/time';

/**
 * The longest an AUTOMATIC hold can last, in days: a machine's decision stays temporary (GDPR
 * Art. 22 weighs the effect of a decision made only by a machine, and a pause that ends by itself
 * within a week is easier to defend than a months-long one). Seven days is also the default window,
 * so a raised window cannot stretch the pause past it. A constant, not a setting. Manual holds
 * keep no maximum, and the review flag outlives the pause until staff act.
 */
export const AUTOMATIC_PURCHASE_HOLD_MAX_DAYS = 7;

/**
 * The instant a hold ends, when `cancelTimes` reach `limit`; otherwise `undefined`.
 *
 * `cancelTimes` are the cancellations to count, already narrowed to those after the last hold or
 * staff lift. Only the ones inside `windowDays` of `now` count. The hold lasts until the count would
 * fall back under the limit: the cancellation that has to age out is the `(count - limit + 1)`-th
 * oldest, so with exactly `limit` of them that is the oldest plus the window. It never ends later
 * than {@link AUTOMATIC_PURCHASE_HOLD_MAX_DAYS} days after `now`; a shorter end is kept as it is.
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
    return new Date(
        Math.min(
            counted[counted.length - limit] + windowMs,
            now.getTime() + AUTOMATIC_PURCHASE_HOLD_MAX_DAYS * DAY_MS
        )
    );
};
