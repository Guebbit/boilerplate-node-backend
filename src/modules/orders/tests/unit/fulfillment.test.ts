/**
 * @module
 * Where the goods stand, beside an order's own status: every row of the projection table, in the
 * order the table is read (first match wins), and the listing filter that must agree with it.
 */

import { OrderFulfillmentStatus, OrderStatus } from '@types';
import {
    NO_FULFILLMENT,
    fulfillmentStatusFilter,
    fulfillmentStatusOf,
    isAwaitingGoods,
    settlementFor,
    type FulfillmentSummary
} from '../../domain';

/** A summary with the fields a case cares about; the rest are zero. */
const summary = (fields: Partial<FulfillmentSummary>): FulfillmentSummary => ({
    ...NO_FULFILLMENT,
    ...fields
});

describe('fulfillmentStatusOf', () => {
    it.each<[string, OrderStatus, Partial<FulfillmentSummary>, OrderFulfillmentStatus]>([
        ['1 · pending', OrderStatus.pending, {}, 'unfulfilled'],
        [
            '1 · pending, whatever the summary says',
            OrderStatus.pending,
            { shipped: true, remaining: 1 },
            'unfulfilled'
        ],
        ['1 · canceled', OrderStatus.canceled, {}, 'unfulfilled'],
        ['1 · delivered', OrderStatus.delivered, { shipped: true }, 'fulfilled'],
        ['1 · shipped', OrderStatus.shipped, { shipped: true, undelivered: 1 }, 'shipped'],
        [
            '2 · something shipped and units remain',
            OrderStatus.processing,
            { shipped: true, remaining: 2, undelivered: 1 },
            'partially_fulfilled'
        ],
        [
            '2 · wins over the hold when part shipped and the rest is held',
            OrderStatus.processing,
            { shipped: true, remaining: 2, onHold: 2 },
            'partially_fulfilled'
        ],
        [
            '3 · nothing shipped, every remaining unit held',
            OrderStatus.processing,
            { remaining: 2, onHold: 2 },
            'on_hold'
        ],
        [
            '3 · on_hold wins over in_progress, and applies to a paid order',
            OrderStatus.paid,
            { remaining: 1, onHold: 1, awaitingStock: 1 },
            'on_hold'
        ],
        [
            '4 · processing with only some units held is in progress',
            OrderStatus.processing,
            { remaining: 3, onHold: 1 },
            'in_progress'
        ],
        ['4 · processing with no summary yet', OrderStatus.processing, {}, 'in_progress'],
        ['4 · paid', OrderStatus.paid, { remaining: 2 }, 'unfulfilled'],
        ['4 · paid with no summary yet', OrderStatus.paid, {}, 'unfulfilled']
    ])('%s', (_row, status, fields, expected) => {
        expect(fulfillmentStatusOf(status, summary(fields))).toBe(expected);
    });

    it('reads an order with no summary at all as its status alone says', () => {
        expect(fulfillmentStatusOf(OrderStatus.shipped)).toBe('shipped');
        expect(fulfillmentStatusOf(OrderStatus.delivered)).toBe('fulfilled');
    });
});

/**
 * The order documents `fulfillmentStatusFilter` is tested against, with the value
 * `fulfillmentStatusOf` gives each — the filter must select exactly the documents whose value it
 * names. Evaluated by a tiny matcher over the filter's own few operators.
 */
const SAMPLES: readonly { status: OrderStatus; fulfillment?: FulfillmentSummary }[] = [
    { status: OrderStatus.pending },
    { status: OrderStatus.canceled },
    { status: OrderStatus.paid },
    { status: OrderStatus.paid, fulfillment: summary({ remaining: 2 }) },
    { status: OrderStatus.paid, fulfillment: summary({ remaining: 1, onHold: 1 }) },
    { status: OrderStatus.processing },
    { status: OrderStatus.processing, fulfillment: summary({ remaining: 3, onHold: 1 }) },
    { status: OrderStatus.processing, fulfillment: summary({ remaining: 2, onHold: 2 }) },
    {
        status: OrderStatus.processing,
        fulfillment: summary({ shipped: true, remaining: 2, onHold: 2, undelivered: 1 })
    },
    {
        status: OrderStatus.processing,
        fulfillment: summary({ shipped: true, remaining: 1, undelivered: 1 })
    },
    { status: OrderStatus.shipped, fulfillment: summary({ shipped: true, undelivered: 1 }) },
    { status: OrderStatus.delivered, fulfillment: summary({ shipped: true }) }
];

/**
 * Evaluate one filter node against a sample, for the operators the filter uses: `$and`, `$or`,
 * `$nor`, `$in`, `$ne`, `$gt`, an equality on a dotted path and the one `$expr` equality.
 * @param node - a filter (or a condition on one path)
 * @param sample - an order document
 */
const matches = (
    node: Readonly<Record<string, unknown>>,
    sample: (typeof SAMPLES)[number]
): boolean =>
    Object.entries(node).every(([key, condition]) => {
        if (key === '$and')
            return (condition as Record<string, unknown>[]).every((one) => matches(one, sample));
        if (key === '$or')
            return (condition as Record<string, unknown>[]).some((one) => matches(one, sample));
        if (key === '$nor')
            return (condition as Record<string, unknown>[]).every((one) => !matches(one, sample));
        if (key === '$expr') return sample.fulfillment?.remaining === sample.fulfillment?.onHold;
        const value =
            key === 'status'
                ? sample.status
                : (sample.fulfillment as Record<string, unknown> | undefined)?.[
                      key.replace('fulfillment.', '')
                  ];
        if (typeof condition !== 'object' || condition === null) return value === condition;
        const operators = condition as { $in?: unknown[]; $ne?: unknown; $gt?: number };
        if (operators.$in) return operators.$in.includes(value);
        if ('$ne' in operators) return value !== operators.$ne;
        return typeof value === 'number' && value > (operators.$gt ?? 0);
    });

describe('fulfillmentStatusFilter', () => {
    // Every carried value, so one missing from the filter enum is a type error.
    const values: OrderFulfillmentStatus[] = Object.values(OrderFulfillmentStatus);

    it.each(values)('selects exactly the orders that read %s', (wanted) => {
        const selected = SAMPLES.filter((sample) =>
            matches(fulfillmentStatusFilter(wanted), sample)
        );
        const expected = SAMPLES.filter(
            (sample) => fulfillmentStatusOf(sample.status, sample.fulfillment) === wanted
        );

        expect(selected).toEqual(expected);
        // Every value is reachable by some sample, so an empty answer cannot pass for the right one.
        expect(expected.length).toBeGreaterThan(0);
    });

    it('selects awaiting_shipment as exactly the samples whose status still owes goods', () => {
        const selected = SAMPLES.filter((sample) =>
            matches(fulfillmentStatusFilter('awaiting_shipment'), sample)
        );

        expect(selected).toEqual(SAMPLES.filter((sample) => isAwaitingGoods(sample.status)));
        expect(selected.length).toBeGreaterThan(0);
        // Whatever it selects reads one of the four owed values, never shipped or fulfilled.
        const owed: OrderFulfillmentStatus[] = [
            'unfulfilled',
            'in_progress',
            'on_hold',
            'partially_fulfilled'
        ];
        for (const sample of selected) {
            expect(owed).toContain(fulfillmentStatusOf(sample.status, sample.fulfillment));
        }
    });
});

describe('settlementFor', () => {
    const arrived = new Date('2026-04-10T15:00:00Z');

    it.each<[string, OrderStatus, Partial<FulfillmentSummary>, string | undefined]>([
        ['units remain', OrderStatus.processing, { shipped: true, remaining: 1 }, undefined],
        ['nothing shipped', OrderStatus.processing, { remaining: 0 }, undefined],
        [
            'the last unit left, a shipment is out',
            OrderStatus.processing,
            { shipped: true, undelivered: 1 },
            'ship'
        ],
        [
            'a shipment is out and the order is already shipped',
            OrderStatus.shipped,
            { shipped: true, undelivered: 1 },
            undefined
        ],
        [
            'everything arrived, from processing',
            OrderStatus.processing,
            { shipped: true, lastDeliveredAt: arrived },
            'complete'
        ],
        [
            'everything arrived, from shipped',
            OrderStatus.shipped,
            { shipped: true, lastDeliveredAt: arrived },
            'deliver'
        ],
        [
            'nothing ever arrived, from processing',
            OrderStatus.processing,
            { shipped: true },
            'undeliverable'
        ],
        ['nothing ever arrived, from shipped', OrderStatus.shipped, { shipped: true }, 'deliver'],
        [
            'everything arrived, already delivered',
            OrderStatus.delivered,
            { shipped: true, lastDeliveredAt: arrived },
            undefined
        ]
    ])('%s', (_name, status, fields, expected) => {
        expect(settlementFor(status, summary(fields))).toBe(expected);
    });
});
