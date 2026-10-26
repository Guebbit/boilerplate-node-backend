/**
 * @module
 * The refund retry delay: doubling from the base, capped at a day, and absent for a final refusal.
 */

import { nextRefundAttemptAt } from '@modules/payments/domain';

const NOW = new Date('2026-01-01T00:00:00Z');

describe('nextRefundAttemptAt', () => {
    it('doubles the base wait with every refusal', () => {
        const waits = [1, 2, 3].map(
            (attempts) =>
                (nextRefundAttemptAt('provider_unavailable', attempts, 5, NOW)!.getTime() -
                    NOW.getTime()) /
                60_000
        );

        expect(waits).toEqual([5, 10, 20]);
    });

    it('never waits more than a day', () => {
        const wait = nextRefundAttemptAt('unknown', 30, 5, NOW)!.getTime() - NOW.getTime();

        expect(wait).toBe(24 * 60 * 60_000);
    });

    it('answers nothing for a final refusal', () => {
        expect(nextRefundAttemptAt('declined', 1, 5, NOW)).toBeUndefined();
    });
});
