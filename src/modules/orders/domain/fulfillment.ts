/**
 * @module
 * The fulfilment summary an order carries, and what is read off it. `orders` cannot import
 * `delivery` (the arrow points the other way), so `delivery` reports where the goods stand as one
 * small record, written only through `orderService.recordFulfillmentProgress`, and everything
 * `orders` itself asks about the goods reads that record.
 *
 * Pure — no I/O. See `docs/modules/orders.md#the-fulfilment-summary`.
 */

import { OrderStatus } from '@types';
import type { OrderFulfillmentStatus } from '@types';
import { ORDER_STATUS_TRAITS, statusesWhere } from './status-traits';

/**
 * Where an order's goods stand, as `delivery` last reported it. Recomputed from the fulfillment
 * orders inside the same transaction as the write that changed them, so a stale read can never
 * overwrite a newer one.
 */
export interface FulfillmentSummary {
    /** At least one shipment exists: the goods have started to leave, so the order is no longer cancellable whole. */
    shipped: boolean;
    /** Units not shipped and not cancelled. */
    remaining: number;
    /** Of {@link remaining}, units in `on_hold` fulfillment orders. */
    onHold: number;
    /** Of {@link remaining}, units held for stock that has not arrived. */
    awaitingStock: number;
    /** Shipments cut and not yet delivered. */
    undelivered: number;
    /** The latest `deliveredAt` of any shipment; absent until one arrives. */
    lastDeliveredAt?: Date;
}

/** What an order with no fulfillment orders yet reports: nothing left, nothing held, nothing out. */
export const NO_FULFILLMENT: FulfillmentSummary = Object.freeze({
    shipped: false,
    remaining: 0,
    onHold: 0,
    awaitingStock: 0,
    undelivered: 0
});

/**
 * Whether every remaining unit is held back — the order has goods to send and none of them may go.
 * @param summary - the order's fulfilment summary
 */
const everyRemainingUnitHeld = (summary: FulfillmentSummary): boolean =>
    !summary.shipped && summary.remaining > 0 && summary.remaining === summary.onHold;

/**
 * Where the goods stand, beside the order's own `status`. First match wins:
 *
 * | # | When | Value |
 * | --- | --- | --- |
 * | 1 | status ignores the summary (`pending`, `shipped`, `delivered`, `cancelled`) | its trait's value |
 * | 2 | something shipped, units remain | `partially_fulfilled` |
 * | 3 | nothing shipped, every remaining unit held | `on_hold` |
 * | 4 | otherwise | its trait's value (`processing` is `in_progress`, `paid` is `unfulfilled`) |
 *
 * The per-status half is `fulfillment` in `ORDER_STATUS_TRAITS`.
 *
 * @param status - the order's status
 * @param summary - what `delivery` reported; absent before the order's fulfillment orders exist
 */
export const fulfillmentStatusOf = (
    status: OrderStatus,
    summary: FulfillmentSummary = NO_FULFILLMENT
): OrderFulfillmentStatus => {
    const { value, followsSummary } = ORDER_STATUS_TRAITS[status].fulfillment;
    if (!followsSummary) return value;
    if (summary.shipped && summary.remaining > 0) return 'partially_fulfilled';
    return everyRemainingUnitHeld(summary) ? 'on_hold' : value;
};

/** A Mongo filter, as plain data: the domain stays free of any driver import. */
export type FulfillmentFilter = Readonly<Record<string, unknown>>;

/** `status` is one of these. */
const statusIn = (...statuses: readonly OrderStatus[]): FulfillmentFilter => ({
    status: { $in: [...statuses] }
});

/** The summary says something shipped and units remain: row 2 of {@link fulfillmentStatusOf}. */
const PARTIALLY_SHIPPED: FulfillmentFilter = {
    'fulfillment.shipped': true,
    'fulfillment.remaining': { $gt: 0 }
};

/** The summary says nothing shipped and every remaining unit is held: row 3. */
const EVERY_UNIT_HELD: FulfillmentFilter = {
    'fulfillment.shipped': { $ne: true },
    'fulfillment.remaining': { $gt: 0 },
    $expr: { $eq: ['$fulfillment.remaining', '$fulfillment.onHold'] }
};

/**
 * The query behind `GET /orders?fulfillmentStatus=`: the stored status and summary conditions
 * that make {@link fulfillmentStatusOf} answer `wanted`. Derived from the same table rather than a
 * stored copy of the answer, so the filter and the value a row serializes with cannot disagree.
 * @param wanted - the value to list
 * @returns a filter to AND into the listing's own
 */
export const fulfillmentStatusFilter = (wanted: OrderFulfillmentStatus): FulfillmentFilter => {
    const neither = { $nor: [PARTIALLY_SHIPPED, EVERY_UNIT_HELD] };
    const withValue = (value: OrderFulfillmentStatus, followsSummary: boolean) =>
        statusIn(
            ...statusesWhere(
                (traits) =>
                    traits.fulfillment.value === value &&
                    traits.fulfillment.followsSummary === followsSummary
            )
        );
    // Statuses whose summary may refine the answer: only they can be partially fulfilled or on hold.
    const inFlight = statusIn(...statusesWhere((traits) => traits.fulfillment.followsSummary));
    switch (wanted) {
        case 'fulfilled':
        case 'shipped': {
            return withValue(wanted, false);
        }
        case 'partially_fulfilled': {
            return { $and: [inFlight, PARTIALLY_SHIPPED] };
        }
        case 'on_hold': {
            return { $and: [inFlight, EVERY_UNIT_HELD] };
        }
        case 'in_progress': {
            return { $and: [withValue(wanted, true), neither] };
        }
        case 'unfulfilled': {
            return {
                $or: [withValue(wanted, false), { $and: [withValue(wanted, true), neither] }]
            };
        }
    }
};
