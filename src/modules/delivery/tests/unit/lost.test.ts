/**
 * @module
 * A lost parcel's arithmetic, pure: what the loss does to the origin fulfillment order's lines, when
 * the parcel turning up may be recorded (every unit still open, all or nothing), what it puts
 * back, and the date the owed units are promised for.
 */

import {
    owedDateOf,
    planRestoration,
    statusOfLines,
    summarize,
    withLoss,
    withRestoration
} from '../../domain';
import type { FulfillmentLine, LostShipmentFacts, RestorableFulfillmentOrder } from '../../domain';

/** A line with nothing shipped or cancelled, unless stated. */
const line = (
    productId: string,
    quantity: number,
    fields: Partial<FulfillmentLine> = {}
): FulfillmentLine => ({
    productId,
    title: `Product ${productId}`,
    quantity,
    shippedQuantity: 0,
    cancelledQuantity: 0,
    ...fields
});

/** A lost shipment of the given units, cut from fulfillment order `fo1`. */
const shipment = (...units: [string, number][]): LostShipmentFacts => ({
    id: 's1',
    fulfillmentOrderId: 'fo1',
    lines: units.map(([productId, quantity]) => ({
        productId,
        title: `Product ${productId}`,
        quantity
    }))
});

describe('withLoss', () => {
    it('takes every lost unit off shipped, and the owed ones also off quantity', () => {
        const lines = withLoss(
            [line('a', 3, { shippedQuantity: 3 })],
            [{ productId: 'a', quantity: 3 }],
            [{ productId: 'a', quantity: 2 }]
        );

        expect(lines).toEqual([line('a', 1, { shippedQuantity: 0 })]);
    });

    it('leaves a line alone when the loss does not touch it', () => {
        const lines = withLoss(
            [line('a', 2, { shippedQuantity: 2 }), line('b', 1, { shippedQuantity: 1 })],
            [{ productId: 'a', quantity: 2 }],
            []
        );

        expect(lines).toEqual([
            line('a', 2, { shippedQuantity: 0 }),
            line('b', 1, { shippedQuantity: 1 })
        ]);
    });

    it('drops a line whose every unit is now owed elsewhere, and the order then reads closed, not cancelled', () => {
        const lines = withLoss(
            [line('a', 2, { shippedQuantity: 2 })],
            [{ productId: 'a', quantity: 2 }],
            [{ productId: 'a', quantity: 2 }]
        );

        expect(lines).toEqual([]);
        expect(statusOfLines(lines, false)).toBe('closed');
    });

    it('never takes shipped below zero', () => {
        const [only] = withLoss(
            [line('a', 2, { shippedQuantity: 1 })],
            [{ productId: 'a', quantity: 2 }],
            []
        );

        expect(only.shippedQuantity).toBe(0);
    });
});

/** The origin fulfillment order of the lost shipment. */
const origin = (lines: FulfillmentLine[]): RestorableFulfillmentOrder => ({ id: 'fo1', lines });

/** A fulfillment order made for the units the loss owed. */
const owedOrder = (lines: FulfillmentLine[]): RestorableFulfillmentOrder => ({
    id: 'fo2',
    sourceShipmentId: 's1',
    lines
});

describe('planRestoration', () => {
    it('allows it when the shelf part is open on the origin and nothing was owed', () => {
        const plan = planRestoration(shipment(['a', 2]), [origin([line('a', 2)])]);

        expect(plan).toEqual({
            shipped: [{ productId: 'a', quantity: 2 }],
            owed: [],
            owedFulfillmentOrderIds: []
        });
    });

    it('allows it when the owed units are all still unshipped and uncancelled', () => {
        const plan = planRestoration(shipment(['a', 3]), [
            origin([line('a', 1)]),
            owedOrder([line('a', 2)])
        ]);

        expect(plan?.owed).toEqual([{ productId: 'a', quantity: 2 }]);
        expect(plan?.owedFulfillmentOrderIds).toEqual(['fo2']);
    });

    it('counts the owed units across the order a short delivery split off', () => {
        const plan = planRestoration(shipment(['a', 3]), [
            origin([line('a', 1)]),
            owedOrder([line('a', 1)]),
            { id: 'fo3', sourceShipmentId: 's1', lines: [line('a', 1)] }
        ]);

        expect(plan?.owedFulfillmentOrderIds).toEqual(['fo2', 'fo3']);
    });

    it('refuses once the replacement shipped, wholly or in part', () => {
        expect(
            planRestoration(shipment(['a', 2]), [origin([line('a', 2, { shippedQuantity: 2 })])])
        ).toBeUndefined();
        expect(
            planRestoration(shipment(['a', 2]), [origin([line('a', 2, { shippedQuantity: 1 })])])
        ).toBeUndefined();
    });

    it('refuses once the remainder was cancelled', () => {
        expect(
            planRestoration(shipment(['a', 2]), [origin([line('a', 2, { cancelledQuantity: 2 })])])
        ).toBeUndefined();
    });

    it('refuses when any owed unit was shipped or cancelled', () => {
        const base = origin([line('a', 1)]);

        expect(
            planRestoration(shipment(['a', 3]), [
                base,
                owedOrder([line('a', 2, { shippedQuantity: 1 })])
            ])
        ).toBeUndefined();
        expect(
            planRestoration(shipment(['a', 3]), [
                base,
                owedOrder([line('a', 2, { cancelledQuantity: 2 })])
            ])
        ).toBeUndefined();
    });

    it('refuses without the origin fulfillment order', () => {
        expect(planRestoration(shipment(['a', 1]), [])).toBeUndefined();
    });

    it('ignores fulfillment orders owed to a different loss', () => {
        const other = { id: 'fo9', sourceShipmentId: 'other', lines: [line('a', 5)] };

        expect(planRestoration(shipment(['a', 2]), [origin([line('a', 2)]), other])?.owed).toEqual(
            []
        );
    });
});

describe('withRestoration', () => {
    it('ships the units again and takes the owed ones back onto the origin', () => {
        const facts = shipment(['a', 3]);
        const plan = planRestoration(facts, [
            { id: 'fo1', lines: [line('a', 1)] },
            { id: 'fo2', sourceShipmentId: 's1', lines: [line('a', 2)] }
        ])!;

        expect(withRestoration([line('a', 1)], facts, plan)).toEqual([
            line('a', 3, { shippedQuantity: 3 })
        ]);
    });

    it('brings back a line the loss dropped, titled from the shipment', () => {
        const facts = shipment(['a', 2]);
        const plan = planRestoration(facts, [
            { id: 'fo1', lines: [] },
            { id: 'fo2', sourceShipmentId: 's1', lines: [line('a', 2)] }
        ])!;

        expect(withRestoration([], facts, plan)).toEqual([line('a', 2, { shippedQuantity: 2 })]);
    });

    it('undoes withLoss exactly', () => {
        const before = [line('a', 3, { shippedQuantity: 3 }), line('b', 1)];
        const facts = shipment(['a', 3]);
        const lost = withLoss(
            before,
            [{ productId: 'a', quantity: 3 }],
            [{ productId: 'a', quantity: 2 }]
        );
        const plan = planRestoration(facts, [
            { id: 'fo1', lines: lost },
            { id: 'fo2', sourceShipmentId: 's1', lines: [line('a', 2)] }
        ])!;

        expect(withRestoration(lost, facts, plan)).toEqual(before);
    });
});

describe('summarize with a lost shipment', () => {
    it('counts it as shipped but not as undelivered', () => {
        const report = summarize({
            fulfillmentOrders: [{ status: 'open', lines: [line('a', 1)] }],
            shipments: [{ status: 'lost' }]
        });

        expect(report).toMatchObject({ shipped: true, remaining: 1, undelivered: 0 });
    });
});

describe('owedDateOf', () => {
    const now = new Date('2026-10-26T10:00:00Z');
    const DAY = 86_400_000;

    it('takes the latest restock date when every product has one still ahead', () => {
        const later = new Date(now.getTime() + 20 * DAY);
        const sooner = new Date(now.getTime() + 5 * DAY);

        expect(owedDateOf([sooner, later], now, 30)).toEqual({ at: later, defaulted: false });
    });

    it('falls back to the default promise when one product names no date', () => {
        const ahead = new Date(now.getTime() + 5 * DAY);

        expect(owedDateOf([ahead, undefined], now, 30)).toEqual({
            at: new Date(now.getTime() + 30 * DAY),
            defaulted: true
        });
    });

    it('treats a date already gone as no date', () => {
        const gone = new Date(now.getTime() - DAY);

        expect(owedDateOf([gone], now, 30).defaulted).toBe(true);
    });
});
