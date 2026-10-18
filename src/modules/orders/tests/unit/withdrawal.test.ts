/**
 * @module
 * The withdrawal window's pure rules — Consumer Rights Directive Art. 9 and 11a, as far as one
 * order can answer them.
 */
import { OrderStatus, WithdrawBlockedReason } from '@types';
import {
    canWithdraw,
    conformityUntilFrom,
    deliveryClockFor,
    isBeforeDispatch,
    isExcludedFromWithdrawal,
    withdrawalRefusalOf,
    withdrawalStartFor,
    withdrawUntilFrom
} from '../../domain';

const NOW = new Date('2026-03-10T12:00:00Z');

describe('withdrawalStartFor', () => {
    const PAID = new Date('2026-03-01T10:00:00Z');
    const physical = { items: [{ product: { requiresShipping: true } }], paidAt: PAID };
    const digital = { items: [{ product: { requiresShipping: false } }], paidAt: PAID };

    it('starts a physical order at the arrival, whatever it was paid', () => {
        expect(withdrawalStartFor(physical, NOW)).toBe(NOW);
    });

    it('starts a digital-only order at payment', () => {
        expect(withdrawalStartFor(digital, NOW)).toBe(PAID);
    });

    it('falls back to the arrival for an unpaid digital order', () => {
        expect(withdrawalStartFor({ ...digital, paidAt: undefined }, NOW)).toBe(NOW);
    });
});

describe('withdrawUntilFrom', () => {
    it('does not count the event day, and ends with the last hour of the 14th day after it', () => {
        expect(withdrawUntilFrom(new Date('2026-03-01T10:00:00Z'), 14).toISOString()).toBe(
            '2026-03-15T23:59:59.999Z'
        );
    });

    it('is the same instant whatever time of day the event happened', () => {
        const morning = withdrawUntilFrom(new Date('2026-03-01T00:00:00Z'), 14);
        const night = withdrawUntilFrom(new Date('2026-03-01T23:59:59Z'), 14);

        expect(night.getTime()).toBe(morning.getTime());
    });

    it('is exact across a month boundary', () => {
        expect(withdrawUntilFrom(new Date('2026-01-25T00:00:00Z'), 14).toISOString()).toBe(
            '2026-02-08T23:59:59.999Z'
        );
    });
});

describe('conformityUntilFrom', () => {
    it('ends with the last hour of the same day two years on', () => {
        expect(conformityUntilFrom(new Date('2026-03-01T10:00:00Z')).toISOString()).toBe(
            '2028-03-01T23:59:59.999Z'
        );
    });

    it('lets a 29 February delivery run to the first of March', () => {
        expect(conformityUntilFrom(new Date('2028-02-29T10:00:00Z')).toISOString()).toBe(
            '2030-03-01T23:59:59.999Z'
        );
    });
});

describe('deliveryClockFor', () => {
    it('counts the withdrawal from its own clock and the guarantee from the arrival', () => {
        const paidAt = new Date('2026-02-01T10:00:00Z');
        const at = new Date('2026-03-01T10:00:00Z');

        const goods = deliveryClockFor({ items: [], paidAt }, at, 30);

        expect(goods.withdrawUntil.toISOString()).toBe('2026-03-31T23:59:59.999Z');
        expect(goods.conformityUntil.toISOString()).toBe('2028-03-01T23:59:59.999Z');
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
        'reads %s as still in the shop’s hands while nothing has shipped',
        (status) => {
            expect(isBeforeDispatch({ status })).toBe(true);
            expect(isBeforeDispatch({ status, fulfillment: { shipped: false } })).toBe(true);
        }
    );

    it.each([OrderStatus.shipped, OrderStatus.delivered, OrderStatus.cancelled])(
        'reads %s as past the shop’s hands',
        (status) => {
            expect(isBeforeDispatch({ status })).toBe(false);
        }
    );

    it('reads a processing order that shipped in part as past the shop’s hands', () => {
        // The shipment is the fact, not the status: refunding this whole would refund goods the
        // buyer already holds.
        expect(
            isBeforeDispatch({ status: OrderStatus.processing, fulfillment: { shipped: true } })
        ).toBe(false);
    });
});

describe('Art. 16 exclusions', () => {
    it('reads a line as excluded only when its product says so', () => {
        expect(isExcludedFromWithdrawal({ product: { noWithdrawal: true } })).toBe(true);
        expect(isExcludedFromWithdrawal({ product: { noWithdrawal: false } })).toBe(false);
        expect(isExcludedFromWithdrawal({ product: {} })).toBe(false);
        expect(isExcludedFromWithdrawal({ product: null })).toBe(false);
    });

    it('offers no withdrawal on an order made only of excluded goods', () => {
        const items = [{ product: { noWithdrawal: true } }];

        expect(canWithdraw({ status: OrderStatus.delivered, items }, NOW)).toBe(false);
    });

    it('still offers it when one line can be withdrawn from', () => {
        const items = [{ product: { noWithdrawal: true } }, { product: { noWithdrawal: false } }];

        expect(canWithdraw({ status: OrderStatus.delivered, items }, NOW)).toBe(true);
    });
});

describe('withdrawalRefusalOf', () => {
    const excluded = { product: { noWithdrawal: true } };
    const ordinary = { product: { noWithdrawal: false } };

    it('has no reason on an order the button is offered on', () => {
        expect(withdrawalRefusalOf({ status: OrderStatus.paid }, NOW)).toBeUndefined();
    });

    it('has no reason on a cancelled order: there is no button to explain', () => {
        expect(
            withdrawalRefusalOf({ status: OrderStatus.cancelled, items: [excluded] }, NOW)
        ).toBeUndefined();
    });

    it('says all_excluded when every line is goods Art. 16 excludes', () => {
        expect(withdrawalRefusalOf({ status: OrderStatus.paid, items: [excluded] }, NOW)).toBe(
            WithdrawBlockedReason.all_excluded
        );
    });

    it('does not refuse a mixed order: the eligible goods can still be withdrawn', () => {
        expect(
            withdrawalRefusalOf({ status: OrderStatus.paid, items: [excluded, ordinary] }, NOW)
        ).toBeUndefined();
    });

    it('says window_closed one millisecond after the window ends', () => {
        const withdrawUntil = new Date(NOW.getTime() - 1);

        expect(withdrawalRefusalOf({ status: OrderStatus.delivered, withdrawUntil }, NOW)).toBe(
            WithdrawBlockedReason.window_closed
        );
    });

    it('says nothing_left once every unit is back', () => {
        expect(
            withdrawalRefusalOf({ status: OrderStatus.delivered, returnStatus: 'returned' }, NOW)
        ).toBe(WithdrawBlockedReason.nothing_left);
    });

    it('names the first reason when several apply', () => {
        const withdrawUntil = new Date(NOW.getTime() - 1);

        expect(
            withdrawalRefusalOf(
                { status: OrderStatus.delivered, items: [excluded], withdrawUntil },
                NOW
            )
        ).toBe(WithdrawBlockedReason.all_excluded);
    });

    it('agrees with canWithdraw on every case above', () => {
        const cases = [
            { status: OrderStatus.paid },
            { status: OrderStatus.cancelled },
            { status: OrderStatus.paid, items: [excluded] },
            { status: OrderStatus.paid, items: [excluded, ordinary] },
            { status: OrderStatus.delivered, withdrawUntil: new Date(NOW.getTime() - 1) },
            { status: OrderStatus.delivered, returnStatus: 'returned' }
        ];

        for (const order of cases)
            expect(canWithdraw(order, NOW)).toBe(
                order.status !== OrderStatus.cancelled &&
                    withdrawalRefusalOf(order, NOW) === undefined
            );
    });
});
