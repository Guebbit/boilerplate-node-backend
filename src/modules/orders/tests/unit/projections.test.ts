/**
 * @module
 * The three statuses beside an order's own: the fulfilment one derived from `status`, the money
 * and the return read from what their owners stamped.
 */
import { OrderStatus } from '@types';
import { fulfillmentStatusOf, paymentStatusOf, returnStatusOf } from '../../domain';

describe('fulfillmentStatusOf', () => {
    it.each([
        [OrderStatus.pending, 'unfulfilled'],
        [OrderStatus.paid, 'unfulfilled'],
        [OrderStatus.cancelled, 'unfulfilled'],
        [OrderStatus.processing, 'in_progress'],
        [OrderStatus.shipped, 'shipped'],
        [OrderStatus.delivered, 'fulfilled']
    ] as const)('reads a %s order as %s', (status, expected) => {
        expect(fulfillmentStatusOf(status)).toBe(expected);
    });
});

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
