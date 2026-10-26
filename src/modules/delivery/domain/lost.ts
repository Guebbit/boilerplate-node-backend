/**
 * @module
 * A parcel that will not arrive, and the same parcel turning up: how a fulfillment order's lines
 * change on each, and when the second is allowed. Pure, so every case is testable without a
 * database. The shape: the lost units reopen on the SAME fulfillment order and ship again through
 * the ordinary door; the part the shelf cannot cover moves to a new fulfillment order on hold.
 *
 * See: docs/modules/delivery.md#lost-in-transit
 */

import { DAY_MS } from '@domain-primitives/time';
import { remainingOfLine } from './fulfillment';
import type { FulfillmentLine, ProductQuantity } from './fulfillment';

/** The lines of a lost shipment, as the plan needs them. */
export interface LostShipmentFacts {
    id: string;
    fulfillmentOrderId: string;
    lines: readonly { productId: string; title: string; quantity: number }[];
}

/** A fulfillment order, as the plan needs it. */
export interface RestorableFulfillmentOrder {
    id: string;
    /** The lost shipment whose owed units it waits for, if it is one of those. */
    sourceShipmentId?: string | undefined;
    lines: readonly FulfillmentLine[];
}

/** What turning up again puts back, per product. */
export interface Restoration {
    /** Every unit the shipment carries: goes back onto the origin's `shippedQuantity`. */
    shipped: ProductQuantity[];
    /** The units that were moved to the owed fulfillment orders: back onto the origin's `quantity`. */
    owed: ProductQuantity[];
    /** The fulfillment orders made for the owed units: closed, with no refund. */
    owedFulfillmentOrderIds: string[];
}

/**
 * One line as plain data: a stored line is a subdocument whose fields sit behind getters.
 * @param line - a line, plain or stored
 */
const plain = (line: FulfillmentLine): FulfillmentLine => ({
    productId: line.productId,
    title: line.title,
    quantity: line.quantity,
    shippedQuantity: line.shippedQuantity,
    cancelledQuantity: line.cancelledQuantity
});

/**
 * Sum of one product over some fulfillment orders' lines, by a per-line measure.
 * @param orders - the fulfillment orders
 * @param productId - the product
 * @param measure - what to add up per line
 */
const sumOf = (
    orders: readonly RestorableFulfillmentOrder[],
    productId: string,
    measure: (line: FulfillmentLine) => number
): number =>
    orders
        .flatMap(({ lines }) => lines)
        .filter((line) => line.productId === productId)
        .reduce((total, line) => total + measure(line), 0);

/**
 * The origin's lines once a shipment was reported lost: every lost unit comes off `shippedQuantity`,
 * and the owed ones also off `quantity` (they now belong to a fulfillment order of their own), so
 * what a buyer can still return or be refunded never exceeds what they bought. A line left with
 * nothing is dropped.
 *
 * @param lines - the origin's lines before
 * @param lost - what the lost shipment carried
 * @param owed - the part of it the shelf could not cover
 */
export const withLoss = (
    lines: readonly FulfillmentLine[],
    lost: readonly ProductQuantity[],
    owed: readonly ProductQuantity[]
): FulfillmentLine[] => {
    const lostBy = new Map(lost.map(({ productId, quantity }) => [productId, quantity]));
    const owedBy = new Map(owed.map(({ productId, quantity }) => [productId, quantity]));
    return lines
        .map((line) => ({
            ...plain(line),
            shippedQuantity: Math.max(0, line.shippedQuantity - (lostBy.get(line.productId) ?? 0)),
            quantity: line.quantity - (owedBy.get(line.productId) ?? 0)
        }))
        .filter((line) => line.quantity > 0);
};

/**
 * Whether a lost shipment may be recorded as arrived, and what that puts back. All or nothing: it
 * is allowed exactly when every unit it carried is still open, so restoring it can never make
 * shipped + cancelled exceed what was bought.
 *
 * - the owed units (on the fulfillment orders made for this loss) are all still unshipped and
 *   uncancelled;
 * - the rest (the part the shelf covered) is still open on the origin fulfillment order.
 *
 * @param shipment - the lost shipment
 * @param orders - every fulfillment order of the order
 * @returns the restoration, or `undefined` when something was shipped again or cancelled
 */
export const planRestoration = (
    shipment: LostShipmentFacts,
    orders: readonly RestorableFulfillmentOrder[]
): Restoration | undefined => {
    const origin = orders.find(({ id }) => id === shipment.fulfillmentOrderId);
    if (!origin) return undefined;
    const linked = orders.filter(({ sourceShipmentId }) => sourceShipmentId === shipment.id);

    const owed: ProductQuantity[] = [];
    for (const { productId, quantity } of shipment.lines) {
        const owedQuantity = sumOf(linked, productId, (line) => line.quantity);
        const owedOpen = sumOf(linked, productId, remainingOfLine);
        const shelfPart = quantity - owedQuantity;
        const originOpen = sumOf([origin], productId, remainingOfLine);
        if (owedOpen !== owedQuantity || shelfPart < 0 || originOpen < shelfPart) return undefined;
        if (owedQuantity > 0) owed.push({ productId, quantity: owedQuantity });
    }

    return {
        shipped: shipment.lines.map(({ productId, quantity }) => ({ productId, quantity })),
        owed,
        owedFulfillmentOrderIds: linked.map(({ id }) => id)
    };
};

/**
 * The origin's lines once the lost parcel turned up: its units are shipped again and the owed ones
 * belong to it once more. A line the loss dropped comes back, titled from the shipment.
 *
 * @param lines - the origin's lines now
 * @param shipment - the shipment that turned up
 * @param restoration - what {@link planRestoration} said goes back
 */
export const withRestoration = (
    lines: readonly FulfillmentLine[],
    shipment: LostShipmentFacts,
    restoration: Restoration
): FulfillmentLine[] => {
    const owedBy = new Map(
        restoration.owed.map(({ productId, quantity }) => [productId, quantity])
    );
    const back = shipment.lines.map(({ productId, title, quantity }) => ({
        productId,
        title,
        quantity,
        owed: owedBy.get(productId) ?? 0
    }));
    const known = new Set(lines.map(({ productId }) => productId));
    const updated = lines.map((line) => {
        const found = back.find(({ productId }) => productId === line.productId);
        return found
            ? {
                  ...plain(line),
                  shippedQuantity: line.shippedQuantity + found.quantity,
                  quantity: line.quantity + found.owed
              }
            : plain(line);
    });
    const dropped = back
        .filter(({ productId }) => !known.has(productId))
        .map(({ productId, title, quantity, owed }) => ({
            productId,
            title,
            quantity: owed,
            shippedQuantity: quantity,
            cancelledQuantity: 0
        }));
    return [...updated, ...dropped];
};

/** When the owed units are expected, and whether that date is the shop's default. */
export interface OwedDate {
    at: Date;
    /** `true` when no catalogue date backed it: a later restock-date change leaves it alone. */
    defaulted: boolean;
}

/**
 * The date the owed units are promised for: the latest restock date among the products when each
 * has one still ahead, else the shop's default promise from now — the rule an order's own
 * backorder follows at checkout.
 *
 * @param restockDates - each owed product's restock date, `undefined` when it names none
 * @param now - the instant of the loss
 * @param defaultDays - the shop's default promise, in days
 */
export const owedDateOf = (
    restockDates: readonly (Date | undefined)[],
    now: Date,
    defaultDays: number
): OwedDate => {
    const ahead = restockDates.filter(
        (date): date is Date => date !== undefined && date.getTime() > now.getTime()
    );
    if (ahead.length === 0 || ahead.length < restockDates.length)
        return { at: new Date(now.getTime() + defaultDays * DAY_MS), defaulted: true };
    return { at: new Date(Math.max(...ahead.map((date) => date.getTime()))), defaulted: false };
};
