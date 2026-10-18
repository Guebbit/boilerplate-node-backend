/**
 * @module
 * The fulfilment rules, pure: how an order's lines split into fulfillment orders, what remains of
 * each, which status follows from its lines and its hold, which lines a shipment may carry, the
 * summary `orders` is handed, and which doors a fulfillment order offers.
 */

import {
    checkShipLines,
    groupOrderLines,
    isFulfillable,
    isHoldable,
    isReleasable,
    isShippable,
    remainderLines,
    remainingOf,
    remainingOfLine,
    statusOfLines,
    summarize,
    withRemainderCancelled,
    withShipped
} from '../../domain';
import type { FulfillmentLine, GroupableLine } from '../../domain';

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

/** An order line as the grouping rule reads it. */
const groupable = (
    productId: string,
    quantity: number,
    fields: Partial<GroupableLine> = {}
): GroupableLine => ({
    productId,
    title: `Product ${productId}`,
    quantity,
    ships: true,
    ...fields
});

describe('groupOrderLines', () => {
    it('makes one open physical fulfillment order of an ordinary order', () => {
        const drafts = groupOrderLines([groupable('a', 2), groupable('b', 1)]);

        expect(drafts).toHaveLength(1);
        expect(drafts[0]).toMatchObject({ number: 1, kind: 'physical', status: 'open' });
        expect(drafts[0].lines.map(({ productId, quantity }) => [productId, quantity])).toEqual([
            ['a', 2],
            ['b', 1]
        ]);
        expect(drafts[0].lines.every(({ shippedQuantity }) => shippedQuantity === 0)).toBe(true);
    });

    it('makes a digital-only order one digital fulfillment order', () => {
        const drafts = groupOrderLines([groupable('a', 1, { ships: false })]);

        expect(drafts).toMatchObject([{ number: 1, kind: 'digital', status: 'open' }]);
    });

    it('keeps the digital lines of a mixed order in the one physical fulfillment order', () => {
        const drafts = groupOrderLines([groupable('a', 1), groupable('b', 1, { ships: false })]);

        expect(drafts).toHaveLength(1);
        expect(drafts[0].kind).toBe('physical');
        expect(drafts[0].lines).toHaveLength(2);
    });

    it('gives each preorder release day its own on_hold fulfillment order, after #1, by date', () => {
        const drafts = groupOrderLines([
            groupable('late', 1, { preorder: true, releaseDate: new Date('2026-12-20T00:00:00Z') }),
            groupable('now', 1),
            groupable('early', 2, {
                preorder: true,
                releaseDate: new Date('2026-12-12T09:30:00Z')
            }),
            groupable('early-too', 1, {
                preorder: true,
                releaseDate: new Date('2026-12-12T18:00:00Z')
            })
        ]);

        expect(drafts.map(({ number, status }) => [number, status])).toEqual([
            [1, 'open'],
            [2, 'on_hold'],
            [3, 'on_hold']
        ]);
        expect(drafts[1].lines.map(({ productId }) => productId)).toEqual(['early', 'early-too']);
        expect(drafts[1]).toMatchObject({ holdReason: 'awaiting_stock' });
        // The day's group leaves together, so it is promised for its latest release instant.
        expect(drafts[1].agreedAt).toEqual(new Date('2026-12-12T18:00:00Z'));
        expect(drafts[1].expectedAt).toEqual(drafts[1].agreedAt);
        expect(drafts[2].agreedAt).toEqual(new Date('2026-12-20T00:00:00Z'));
    });

    it('ships the shelf part of a half-covered line now and holds the owed part for its promise', () => {
        const promisedAt = new Date('2026-12-20T00:00:00Z');
        const drafts = groupOrderLines([
            groupable('half', 3, { backorder: { quantity: 1, promisedAt, dated: true } }),
            groupable('plain', 1)
        ]);

        expect(drafts.map(({ number, status }) => [number, status])).toEqual([
            [1, 'open'],
            [2, 'on_hold']
        ]);
        expect(drafts[0].lines.map(({ productId, quantity }) => [productId, quantity])).toEqual([
            ['half', 2],
            ['plain', 1]
        ]);
        expect(drafts[1]).toMatchObject({
            holdReason: 'awaiting_stock',
            cause: 'backorder',
            agreedAt: promisedAt,
            expectedAt: promisedAt
        });
        expect(drafts[1].lines).toMatchObject([{ productId: 'half', quantity: 1 }]);
        expect(drafts[1].defaulted).toBeUndefined();
    });

    it('holds a line the shelf did not cover at all, and opens nothing for it', () => {
        const promisedAt = new Date('2026-12-20T00:00:00Z');

        const drafts = groupOrderLines([
            groupable('none', 2, { backorder: { quantity: 2, promisedAt, dated: true } })
        ]);

        expect(drafts).toHaveLength(1);
        expect(drafts[0]).toMatchObject({ number: 1, status: 'on_hold', cause: 'backorder' });
    });

    it('marks a group promised the 30-day default, and keeps it apart from a dated one', () => {
        const promisedAt = new Date('2026-12-20T09:00:00Z');
        const drafts = groupOrderLines([
            groupable('dated', 1, { backorder: { quantity: 1, promisedAt, dated: true } }),
            groupable('default', 1, { backorder: { quantity: 1, promisedAt, dated: false } })
        ]);

        expect(drafts).toHaveLength(2);
        expect(drafts.filter(({ defaulted }) => defaulted === true)).toHaveLength(1);
        expect(drafts.find(({ defaulted }) => defaulted)?.lines[0].productId).toBe('default');
    });

    it('keeps a preorder and a backorder due the same day in groups of their own', () => {
        const date = new Date('2026-12-20T00:00:00Z');
        const drafts = groupOrderLines([
            groupable('pre', 1, { preorder: true, releaseDate: date }),
            groupable('back', 1, { backorder: { quantity: 1, promisedAt: date, dated: true } })
        ]);

        expect(drafts.map(({ cause }) => cause).toSorted()).toEqual(['backorder', 'preorder']);
    });

    it('gives made-to-order lines a fulfillment order of their own, after the ordinary one', () => {
        const drafts = groupOrderLines([
            groupable('engraved', 1, { noWithdrawal: true }),
            groupable('shirt', 2)
        ]);

        expect(drafts.map(({ number, status }) => [number, status])).toEqual([
            [1, 'open'],
            [2, 'open']
        ]);
        expect(drafts[0].lines.map(({ productId }) => productId)).toEqual(['shirt']);
        expect(drafts[1].lines.map(({ productId }) => productId)).toEqual(['engraved']);
    });

    it('makes one fulfillment order of an order made only of made-to-order lines', () => {
        const drafts = groupOrderLines([
            groupable('a', 1, { noWithdrawal: true }),
            groupable('b', 1, { noWithdrawal: true })
        ]);

        expect(drafts).toHaveLength(1);
        expect(drafts[0].lines).toHaveLength(2);
    });

    it('keeps a release day’s made-to-order preorder apart from its ordinary one', () => {
        const releaseDate = new Date('2026-12-12T00:00:00Z');
        const drafts = groupOrderLines([
            groupable('bespoke', 1, { preorder: true, releaseDate, noWithdrawal: true }),
            groupable('plain', 1, { preorder: true, releaseDate })
        ]);

        expect(drafts.map(({ lines }) => lines.map(({ productId }) => productId))).toEqual([
            ['plain'],
            ['bespoke']
        ]);
    });

    it('numbers an order of preorders alone from 1, with no open fulfillment order', () => {
        const drafts = groupOrderLines([
            groupable('a', 1, { preorder: true, releaseDate: new Date('2026-12-12T00:00:00Z') })
        ]);

        expect(drafts).toMatchObject([{ number: 1, status: 'on_hold' }]);
    });

    it('treats a preorder line with no date as an ordinary one: with nothing to wait for it cannot be held', () => {
        const drafts = groupOrderLines([groupable('a', 1, { preorder: true })]);

        expect(drafts).toMatchObject([{ number: 1, status: 'open' }]);
    });

    it('makes nothing of an order with no lines', () => {
        expect(groupOrderLines([])).toEqual([]);
    });
});

describe('remaining', () => {
    it('is quantity less what shipped and what was cancelled, per line and across lines', () => {
        const lines = [line('a', 5, { shippedQuantity: 2, cancelledQuantity: 1 }), line('b', 3)];

        expect(remainingOfLine(lines[0])).toBe(2);
        expect(remainingOf(lines)).toBe(5);
        expect(remainderLines(lines)).toEqual([
            { productId: 'a', quantity: 2 },
            { productId: 'b', quantity: 3 }
        ]);
    });

    it('leaves a line with nothing left out of the remainder', () => {
        expect(remainderLines([line('a', 2, { shippedQuantity: 2 })])).toEqual([]);
    });
});

describe('statusOfLines', () => {
    it.each([
        ['nothing shipped, no hold', [line('a', 2)], false, 'open'],
        [
            'something shipped, lines remain',
            [line('a', 2, { shippedQuantity: 1 })],
            false,
            'in_progress'
        ],
        ['a hold, nothing shipped', [line('a', 2)], true, 'on_hold'],
        ['a hold, part shipped', [line('a', 2, { shippedQuantity: 1 })], true, 'on_hold'],
        ['everything shipped', [line('a', 2, { shippedQuantity: 2 })], false, 'closed'],
        [
            'shipped and the rest cancelled',
            [line('a', 3, { shippedQuantity: 1, cancelledQuantity: 2 })],
            false,
            'closed'
        ],
        [
            'everything cancelled, nothing ever shipped',
            [line('a', 2, { cancelledQuantity: 2 })],
            false,
            'cancelled'
        ],
        [
            'a hold on a fulfillment order with nothing remaining is no hold',
            [line('a', 2, { shippedQuantity: 2 })],
            true,
            'closed'
        ]
    ] as const)('%s', (_case, lines, held, expected) => {
        expect(statusOfLines(lines, held)).toBe(expected);
    });
});

describe('checkShipLines', () => {
    const lines = [line('a', 3, { shippedQuantity: 1 }), line('b', 1)];

    it('ships everything that remains when no lines are named', () => {
        expect(checkShipLines(lines, undefined)).toEqual({
            ok: true,
            lines: [
                { productId: 'a', quantity: 2 },
                { productId: 'b', quantity: 1 }
            ]
        });
        expect(checkShipLines(lines, [])).toMatchObject({ ok: true });
    });

    it('says nothing remains when everything left already', () => {
        expect(checkShipLines([line('a', 1, { shippedQuantity: 1 })], undefined)).toEqual({
            ok: false,
            reason: 'nothing-remains'
        });
    });

    it('accepts named lines within what remains, summing a product named twice', () => {
        expect(
            checkShipLines(lines, [
                { productId: 'a', quantity: 1 },
                { productId: 'a', quantity: 1 }
            ])
        ).toEqual({ ok: true, lines: [{ productId: 'a', quantity: 2 }] });
    });

    it('refuses a product that is not on the fulfillment order, and more than remains of one', () => {
        expect(checkShipLines(lines, [{ productId: 'zzz', quantity: 1 }])).toEqual({
            ok: false,
            reason: 'unknown-product'
        });
        expect(checkShipLines(lines, [{ productId: 'a', quantity: 3 }])).toEqual({
            ok: false,
            reason: 'too-many'
        });
        // Twice over what remains, summed, is more than remains.
        expect(
            checkShipLines(lines, [
                { productId: 'b', quantity: 1 },
                { productId: 'b', quantity: 1 }
            ])
        ).toEqual({ ok: false, reason: 'too-many' });
    });
});

describe('withShipped and withRemainderCancelled', () => {
    it('add what shipped, and cancel exactly what remains, without touching the other lines', () => {
        const before = [line('a', 3, { shippedQuantity: 1 }), line('b', 2)];

        const shipped = withShipped(before, [{ productId: 'a', quantity: 2 }]);
        const cancelled = withRemainderCancelled(before);

        expect(shipped.map(({ shippedQuantity }) => shippedQuantity)).toEqual([3, 0]);
        expect(cancelled.map(({ cancelledQuantity }) => cancelledQuantity)).toEqual([2, 2]);
        expect(remainingOf(cancelled)).toBe(0);
        // Pure: the lines it was handed are as they were.
        expect(before.map(({ shippedQuantity }) => shippedQuantity)).toEqual([1, 0]);
    });

    it('copes with a stored subdocument, whose fields live behind getters a spread does not copy', () => {
        const stored = Object.create({
            get productId() {
                return 'a';
            },
            get title() {
                return 'Product a';
            },
            get quantity() {
                return 3;
            },
            get shippedQuantity() {
                return 1;
            },
            get cancelledQuantity() {
                return 0;
            }
        }) as FulfillmentLine;

        const [shipped] = withShipped([stored], [{ productId: 'a', quantity: 1 }]);

        expect(shipped).toEqual({
            productId: 'a',
            title: 'Product a',
            quantity: 3,
            shippedQuantity: 2,
            cancelledQuantity: 0
        });
    });
});

describe('summarize', () => {
    it('reports nothing shipped, and every remaining unit, for fresh fulfillment orders', () => {
        const summary = summarize({
            fulfillmentOrders: [{ status: 'open', lines: [line('a', 2), line('b', 1)] }],
            shipments: []
        });

        expect(summary).toEqual({
            shipped: false,
            remaining: 3,
            onHold: 0,
            awaitingStock: 0,
            undelivered: 0
        });
    });

    it('counts held units apart from the units held for stock, and leaves closed and cancelled orders out', () => {
        const summary = summarize({
            fulfillmentOrders: [
                { status: 'open', lines: [line('a', 2)] },
                { status: 'on_hold', holdReason: 'high_risk', lines: [line('b', 1)] },
                { status: 'on_hold', holdReason: 'awaiting_stock', lines: [line('c', 4)] },
                { status: 'closed', lines: [line('d', 1, { shippedQuantity: 1 })] },
                { status: 'cancelled', lines: [line('e', 9, { cancelledQuantity: 9 })] }
            ],
            shipments: []
        });

        expect(summary).toMatchObject({ remaining: 7, onHold: 5, awaitingStock: 4 });
    });

    it('counts the shipments still out, and reports the latest arrival', () => {
        const early = new Date('2026-05-01T10:00:00Z');
        const late = new Date('2026-05-03T10:00:00Z');

        const summary = summarize({
            fulfillmentOrders: [
                { status: 'closed', lines: [line('a', 2, { shippedQuantity: 2 })] }
            ],
            shipments: [
                { status: 'delivered', deliveredAt: late },
                { status: 'delivered', deliveredAt: early },
                { status: 'shipped' }
            ]
        });

        expect(summary).toEqual({
            shipped: true,
            remaining: 0,
            onHold: 0,
            awaitingStock: 0,
            undelivered: 1,
            lastDeliveredAt: late
        });
    });
});

describe('what a fulfillment order offers', () => {
    const open = { kind: 'physical', status: 'open', lines: [line('a', 1)] } as const;

    it('ships a physical one that is open or in progress with units left, and nothing else', () => {
        expect(isShippable(open)).toBe(true);
        expect(isShippable({ ...open, status: 'in_progress' })).toBe(true);
        expect(isShippable({ ...open, status: 'on_hold' })).toBe(false);
        expect(isShippable({ ...open, status: 'closed' })).toBe(false);
        expect(isShippable({ ...open, kind: 'digital' })).toBe(false);
        expect(isShippable({ ...open, lines: [line('a', 1, { shippedQuantity: 1 })] })).toBe(false);
    });

    it('fulfils a digital one that is open with units left — the mirror of ship', () => {
        expect(isFulfillable({ ...open, kind: 'digital' })).toBe(true);
        expect(isFulfillable(open)).toBe(false);
        expect(isFulfillable({ ...open, kind: 'digital', status: 'closed' })).toBe(false);
    });

    it('holds anything workable with units left', () => {
        expect(isHoldable(open)).toBe(true);
        expect(isHoldable({ ...open, status: 'on_hold' })).toBe(false);
        expect(
            isHoldable({
                ...open,
                status: 'cancelled',
                lines: [line('a', 1, { cancelledQuantity: 1 })]
            })
        ).toBe(false);
    });

    it('releases a hold of staff’s, and never one for stock: only the allocation does that', () => {
        const held = { ...open, status: 'on_hold' } as const;

        expect(isReleasable({ ...held, holdReason: 'high_risk' })).toBe(true);
        expect(isReleasable({ ...held, holdReason: 'other' })).toBe(true);
        expect(isReleasable({ ...held, holdReason: 'awaiting_stock' })).toBe(false);
        expect(isReleasable(open)).toBe(false);
    });
});
