/**
 * The event-filter rule — see `../../domain/event-filter.ts`.
 */

import { matchesEventFilter, ALL_EVENTS } from '@modules/webhooks/domain';

describe('matchesEventFilter', () => {
    it('matches an exact name in the filter', () => {
        expect(matchesEventFilter('order.paid', ['order.paid', 'order.shipped'])).toBe(true);
    });

    it('does not match a name absent from the filter', () => {
        expect(matchesEventFilter('order.cancelled', ['order.paid', 'order.shipped'])).toBe(false);
    });

    it('matches everything once the wildcard is present', () => {
        expect(matchesEventFilter('payment.failed', [ALL_EVENTS])).toBe(true);
        expect(matchesEventFilter('anything.at-all', [ALL_EVENTS])).toBe(true);
    });

    it('is false against an empty filter', () => {
        expect(matchesEventFilter('order.paid', [])).toBe(false);
    });

    it('the wildcard is exactly "*"', () => {
        expect(ALL_EVENTS).toBe('*');
    });
});
