/**
 * @module
 * The withdrawal window's pure rules — Consumer Rights Directive Art. 9 and 11a, as far as one
 * order can answer them.
 */
import { OrderStatus } from '@types';
import { canWithdraw, isBeforeDispatch, withdrawUntilFrom } from '../../domain';

const NOW = new Date('2026-03-10T12:00:00Z');

describe('withdrawUntilFrom', () => {
    it('counts whole days from the start', () => {
        expect(withdrawUntilFrom(new Date('2026-03-01T10:00:00Z'), 14).toISOString()).toBe(
            '2026-03-15T10:00:00.000Z'
        );
    });

    it('is exact across a month boundary', () => {
        expect(withdrawUntilFrom(new Date('2026-01-25T00:00:00Z'), 14).toISOString()).toBe(
            '2026-02-08T00:00:00.000Z'
        );
    });
});

describe('canWithdraw', () => {
    it.each([
        OrderStatus.pending,
        OrderStatus.paid,
        OrderStatus.processing,
        OrderStatus.shipped,
        OrderStatus.delivered
    ])('is offered on a %s order whose window has not started', (status) => {
        expect(canWithdraw({ status }, NOW)).toBe(true);
    });

    it('is never offered on a cancelled order', () => {
        expect(canWithdraw({ status: OrderStatus.cancelled }, NOW)).toBe(false);
    });

    it('is offered while the window is open, and on its last instant', () => {
        const withdrawUntil = new Date('2026-03-10T12:00:00Z');

        expect(canWithdraw({ status: OrderStatus.delivered, withdrawUntil }, NOW)).toBe(true);
    });

    it('is gone one millisecond after the window closes', () => {
        const withdrawUntil = new Date(NOW.getTime() - 1);

        expect(canWithdraw({ status: OrderStatus.delivered, withdrawUntil }, NOW)).toBe(false);
    });
});

describe('isBeforeDispatch', () => {
    it.each([OrderStatus.pending, OrderStatus.paid, OrderStatus.processing])(
        'reads %s as still in the shop’s hands',
        (status) => {
            expect(isBeforeDispatch(status)).toBe(true);
        }
    );

    it.each([OrderStatus.shipped, OrderStatus.delivered, OrderStatus.cancelled])(
        'reads %s as past the shop’s hands',
        (status) => {
            expect(isBeforeDispatch(status)).toBe(false);
        }
    );
});
