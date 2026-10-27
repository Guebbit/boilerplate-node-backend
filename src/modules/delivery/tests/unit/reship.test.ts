/**
 * @module
 * Sending delivered goods again, pure: which fulfillment orders give their shipped units back
 * (the latest first), when the order simply did not ship that many, and how the owed part is
 * shared out so a fulfillment order never hands over more than it reopened.
 */

import { planReopening, shareOwed, withLoss } from '../../domain';
import type { FulfillmentLine, ReopenableFulfillmentOrder } from '../../domain';

/** A line shipped in full, unless stated. */
const line = (productId: string, quantity: number, shipped = quantity): FulfillmentLine => ({
    productId,
    title: `Product ${productId}`,
    quantity,
    shippedQuantity: shipped,
    cancelledQuantity: 0
});

/** A physical fulfillment order with the given lines. */
const fulfillmentOrder = (
    id: string,
    number: number,
    lines: FulfillmentLine[],
    physical = true
): ReopenableFulfillmentOrder => ({ id, number, physical, lines });

describe('planReopening', () => {
    it('takes the units from the latest fulfillment order first', () => {
        const plan = planReopening(
            [
                fulfillmentOrder('fo1', 1, [line('a', 2)]),
                fulfillmentOrder('fo2', 2, [line('a', 1)])
            ],
            [{ productId: 'a', quantity: 2 }]
        );

        expect(plan).toEqual([
            { fulfillmentOrderId: 'fo2', units: [{ productId: 'a', quantity: 1 }] },
            { fulfillmentOrderId: 'fo1', units: [{ productId: 'a', quantity: 1 }] }
        ]);
    });

    it('refuses when the order shipped fewer units than come back', () => {
        expect(
            planReopening(
                [fulfillmentOrder('fo1', 1, [line('a', 2, 1)])],
                [{ productId: 'a', quantity: 2 }]
            )
        ).toBeUndefined();
    });

    it('never reopens a digital fulfillment order', () => {
        expect(
            planReopening(
                [fulfillmentOrder('fo1', 1, [line('a', 1)], false)],
                [{ productId: 'a', quantity: 1 }]
            )
        ).toBeUndefined();
    });

    it('opens the units of the lines it was asked for and no others', () => {
        const [only] = planReopening(
            [fulfillmentOrder('fo1', 1, [line('a', 2), line('b', 3)])],
            [{ productId: 'b', quantity: 1 }]
        )!;

        expect(only.units).toEqual([{ productId: 'b', quantity: 1 }]);
    });
});

describe('shareOwed', () => {
    it('hands the owed units to the fulfillment orders in plan order, never more than each reopened', () => {
        const shared = shareOwed(
            [
                { fulfillmentOrderId: 'fo2', units: [{ productId: 'a', quantity: 1 }] },
                { fulfillmentOrderId: 'fo1', units: [{ productId: 'a', quantity: 2 }] }
            ],
            [{ productId: 'a', quantity: 2 }]
        );

        expect(shared.get('fo2')).toEqual([{ productId: 'a', quantity: 1 }]);
        expect(shared.get('fo1')).toEqual([{ productId: 'a', quantity: 1 }]);
    });

    it('hands over nothing when nothing is owed', () => {
        const shared = shareOwed(
            [{ fulfillmentOrderId: 'fo1', units: [{ productId: 'a', quantity: 2 }] }],
            []
        );

        expect(shared.get('fo1')).toEqual([]);
    });
});

describe('reopening through withLoss', () => {
    it('opens the units again on the same line and drops a line that moved entirely to the owed order', () => {
        const reopened = withLoss(
            [line('a', 2), line('b', 1)],
            [
                { productId: 'a', quantity: 2 },
                { productId: 'b', quantity: 1 }
            ],
            [{ productId: 'b', quantity: 1 }]
        );

        expect(reopened).toEqual(
            [
                { ...line('a', 2, 0) }
                // `b` was owed in full, so it left this fulfillment order altogether.
            ].filter(Boolean)
        );
    });
});
