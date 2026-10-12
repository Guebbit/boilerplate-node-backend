/**
 * @module
 * The statuses stamped beside an order's own: the money and the return, read from what their
 * owners stamped. The fulfilment one reads the summary `delivery` reports, in `fulfillment.test.ts`.
 */
import { paymentStatusOf, returnStatusOf } from '../../domain';

describe('paymentStatusOf', () => {
    const paidAt = new Date('2026-03-01T00:00:00Z');

    it('is unpaid until the order was ever paid', () => {
        expect(paymentStatusOf(undefined, undefined)).toBe('unpaid');
    });

    it('is paid once it was, with nothing refunded', () => {
        expect(paymentStatusOf(undefined, paidAt)).toBe('paid');
    });

    it.each(['partially_refunded', 'refunded'] as const)(
        'lets a stamped %s win over paidAt',
        (stamped) => {
            expect(paymentStatusOf(stamped, paidAt)).toBe(stamped);
        }
    );
});

describe('returnStatusOf', () => {
    it('is none without a stamp', () => {
        expect(returnStatusOf(undefined)).toBe('none');
    });

    it('is the stamp otherwise', () => {
        expect(returnStatusOf('partially_returned')).toBe('partially_returned');
    });
});
