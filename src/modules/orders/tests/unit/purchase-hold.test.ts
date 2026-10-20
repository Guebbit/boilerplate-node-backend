/**
 * @module
 * When a buyer's own cancellations amount to a purchase hold — the pure rule, with the clock, the
 * limit and the window as arguments.
 */

import { DAY_MS } from '@domain-primitives/time';
import { AUTOMATIC_PURCHASE_HOLD_MAX_DAYS, purchaseHoldUntil } from '../../domain';

const NOW = new Date('2026-10-19T12:00:00.000Z');

/** An instant `days` before {@link NOW}. */
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

describe('purchaseHoldUntil', () => {
    it('is undefined below the limit', () => {
        expect(purchaseHoldUntil([daysAgo(1), daysAgo(2)], 3, 7, NOW)).toBeUndefined();
    });

    it('is the oldest counted cancel plus the window when exactly the limit is reached', () => {
        const until = purchaseHoldUntil([daysAgo(1), daysAgo(2), daysAgo(5)], 3, 7, NOW);

        expect(until).toEqual(new Date(daysAgo(5).getTime() + 7 * DAY_MS));
    });

    it('waits for enough to age out when more than the limit were counted', () => {
        // Four inside the window with a limit of three: the hold lasts until the SECOND oldest
        // ages out, which is when the count falls back to two.
        const until = purchaseHoldUntil(
            [daysAgo(6), daysAgo(4), daysAgo(2), daysAgo(1)],
            3,
            7,
            NOW
        );

        expect(until).toEqual(new Date(daysAgo(4).getTime() + 7 * DAY_MS));
    });

    it('ignores a cancel older than the window', () => {
        expect(purchaseHoldUntil([daysAgo(8), daysAgo(2), daysAgo(1)], 3, 7, NOW)).toBeUndefined();
    });

    it('counts a cancel exactly one window old as aged out', () => {
        expect(purchaseHoldUntil([daysAgo(7), daysAgo(2), daysAgo(1)], 3, 7, NOW)).toBeUndefined();
    });

    it('does not depend on the order the times arrive in', () => {
        const times = [daysAgo(1), daysAgo(5), daysAgo(2)];

        expect(purchaseHoldUntil(times, 3, 7, NOW)).toEqual(
            purchaseHoldUntil(times.toReversed(), 3, 7, NOW)
        );
    });

    it('is undefined with no cancels', () => {
        expect(purchaseHoldUntil([], 3, 7, NOW)).toBeUndefined();
    });
});

describe('the 7-day cap on an automatic hold', () => {
    it('is seven days', () => {
        expect(AUTOMATIC_PURCHASE_HOLD_MAX_DAYS).toBe(7);
    });

    it('ends no later than 7 days after now, however long the window is', () => {
        const until = purchaseHoldUntil([daysAgo(1), daysAgo(2), daysAgo(3)], 3, 90, NOW);

        expect(until).toEqual(new Date(NOW.getTime() + 7 * DAY_MS));
    });

    it('keeps an end that is already sooner than the cap', () => {
        // Oldest counted cancel 6.5 days ago in a 7-day window: the count falls back in 12 hours.
        const oldest = new Date(NOW.getTime() - 6.5 * DAY_MS);
        const until = purchaseHoldUntil([oldest, daysAgo(1), daysAgo(2)], 3, 7, NOW);

        expect(until).toEqual(new Date(oldest.getTime() + 7 * DAY_MS));
        expect(until!.getTime() - NOW.getTime()).toBeLessThan(7 * DAY_MS);
    });

    it('is exact at the boundary: an end exactly 7 days away is kept', () => {
        // Window 14 days, oldest counted cancel 7 days ago: oldest + window is exactly now + 7 days.
        const oldest = daysAgo(7);
        const until = purchaseHoldUntil([oldest, daysAgo(1), daysAgo(2)], 3, 14, NOW);

        expect(until).toEqual(new Date(NOW.getTime() + 7 * DAY_MS));
    });
});
