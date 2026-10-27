/**
 * @module
 * Which fulfillment orders reopen when delivered goods come back and are sent again (a replacement
 * under the legal guarantee), and which of them carry the part the shelf cannot cover. Pure, so
 * every case is testable without a database. The lines themselves change through `withLoss`, the
 * same rule a lost parcel follows.
 *
 * See: docs/modules/delivery.md#replacement-after-a-return
 */

import type { FulfillmentLine, ProductQuantity } from './fulfillment';

/** A fulfillment order, as the plan needs it. */
export interface ReopenableFulfillmentOrder {
    id: string;
    /** `true` for one that ships a parcel; a digital one has nothing to send again. */
    physical: boolean;
    /** Its position among the order's fulfillment orders; the latest shipped is reopened first. */
    number: number;
    lines: readonly FulfillmentLine[];
}

/** The units one fulfillment order gives back to be sent again. */
export interface Reopening {
    fulfillmentOrderId: string;
    units: ProductQuantity[];
}

/**
 * Take `needed` units off the shipped quantity of the order's physical fulfillment orders, the
 * latest first. Refused (`undefined`) when the order never shipped that many units.
 *
 * @param orders - every fulfillment order of the order
 * @param needed - the units to send again, per product
 * @returns what each fulfillment order gives back, or `undefined` when the order shipped too few
 */
export const planReopening = (
    orders: readonly ReopenableFulfillmentOrder[],
    needed: readonly ProductQuantity[]
): Reopening[] | undefined => {
    const latestFirst = orders
        .filter(({ physical }) => physical)
        .toSorted((a, b) => b.number - a.number);
    const taken = new Map<string, ProductQuantity[]>();
    for (const { productId, quantity } of needed) {
        let left = quantity;
        for (const order of latestFirst) {
            const shipped = order.lines
                .filter((line) => line.productId === productId)
                .reduce((total, line) => total + line.shippedQuantity, 0);
            const take = Math.min(left, shipped);
            if (take <= 0) continue;
            taken.set(order.id, [...(taken.get(order.id) ?? []), { productId, quantity: take }]);
            left -= take;
        }
        if (left > 0) return undefined;
    }
    return [...taken].map(([fulfillmentOrderId, units]) => ({ fulfillmentOrderId, units }));
};

/**
 * Share the owed units out over the fulfillment orders that reopened, so a line never gives up
 * more to the owed order than it reopened.
 *
 * @param reopenings - what {@link planReopening} decided
 * @param owed - the part of the re-send the shelf could not cover, per product
 * @returns per fulfillment order id, the owed units it hands to the owed order
 */
export const shareOwed = (
    reopenings: readonly Reopening[],
    owed: readonly ProductQuantity[]
): Map<string, ProductQuantity[]> => {
    const left = new Map(owed.map(({ productId, quantity }) => [productId, quantity]));
    const shared = new Map<string, ProductQuantity[]>();
    for (const { fulfillmentOrderId, units } of reopenings) {
        const mine: ProductQuantity[] = [];
        for (const { productId, quantity } of units) {
            const take = Math.min(quantity, left.get(productId) ?? 0);
            if (take <= 0) continue;
            mine.push({ productId, quantity: take });
            left.set(productId, (left.get(productId) ?? 0) - take);
        }
        shared.set(fulfillmentOrderId, mine);
    }
    return shared;
};
