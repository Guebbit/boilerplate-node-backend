/**
 * @module
 * The one place a cart's facts become the `CartResponse` the contract declares. `services/view.ts`
 * reads the lines, the ledger and the shipping options; this decides what the wire carries from
 * them, including the flags a client would otherwise re-derive (`canIncrease`, `checkoutable`).
 */

import type { Availability, CartResponse, CartShipping, CartWarning } from '@types';

/** The cart as `openapi.yaml` declares it: `CartResponse`, built rather than serialized. */
export type CartView = CartResponse;

/** A stored line with the product's own stock answer and whether checkout would take it as it stands. */
export interface JudgedCartLine {
    productId: string;
    quantity: number;
    availability: Availability;
    availabilityDate?: string;
    /** How many can be bought now; absent is no limit. */
    quantityAvailable?: number;
    /** Units of this line that ship later; absent for none. */
    quantityBackordered?: number;
    /** The product is shown, on sale, and the line holds no more than can be bought. */
    buyable: boolean;
}

/** What the presenter needs; every number already computed by the services. */
export interface CartFacts {
    lines: readonly JudgedCartLine[];
    /** Distinct lines, total units and the items' gross total, as `sumLineItems` counts them. */
    count: number;
    quantity: number;
    itemsTotal: string;
    shippingCost: string;
    /** Items plus shipping, as decimal text. */
    totalPrice: string;
    currency: string;
    shipping: CartShipping;
    /** The shop's per-line ceiling, `cartLineMax()`. */
    lineMax: number;
    /** What the write clamped or could not add; absent for a read and for a write that landed as asked. */
    warnings?: readonly CartWarning[] | undefined;
}

/**
 * Turn a cart's facts into the response the contract declares.
 *
 * @param facts - the judged lines, the totals and the shipping picture
 * @returns the cart as the wire carries it
 */
export const presentCart = ({
    lines,
    count,
    quantity,
    itemsTotal,
    shippingCost,
    totalPrice,
    currency,
    shipping,
    lineMax,
    warnings
}: CartFacts): CartView => ({
    items: lines.map(
        ({
            productId,
            quantity: lineQuantity,
            availability,
            availabilityDate,
            quantityAvailable,
            quantityBackordered
        }) => ({
            productId,
            quantity: lineQuantity,
            availability,
            ...(availabilityDate === undefined ? {} : { availabilityDate }),
            ...(quantityAvailable === undefined ? {} : { quantityAvailable }),
            ...(quantityBackordered === undefined ? {} : { quantityBackordered }),
            // Stops at the shop's ceiling and at what can be bought, whichever comes first.
            canIncrease:
                lineQuantity < lineMax &&
                (quantityAvailable === undefined || lineQuantity < quantityAvailable)
        })
    ),
    summary: {
        itemsCount: count,
        totalQuantity: quantity,
        itemsTotal,
        shippingCost,
        totalPrice,
        currency
    },
    shipping,
    checkoutable: lines.length > 0 && lines.every(({ buyable }) => buyable),
    ...(warnings && warnings.length > 0 ? { warnings: [...warnings] } : {})
});
