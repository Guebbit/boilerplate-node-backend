/**
 * @module
 * The one place a cart's facts become the `CartResponse` the contract declares. `services/view.ts`
 * reads the lines, the ledger and the shipping options; this decides what the wire carries from
 * them, including the flags a client would otherwise re-derive (`canIncrease`, `checkoutable`).
 */

import type { CartResponse, CartShipping, LineAvailability } from '@types';
import { isBuyable } from './domain';

/** The cart as `openapi.yaml` declares it: `CartResponse`, built rather than serialized. */
export type CartView = CartResponse;

/** A stored line with the availability the shared rule judged for it. */
export interface JudgedCartLine {
    productId: string;
    quantity: number;
    availability: LineAvailability;
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
    lineMax
}: CartFacts): CartView => ({
    items: lines.map(({ productId, quantity: lineQuantity, availability }) => ({
        productId,
        quantity: lineQuantity,
        availability,
        canIncrease: lineQuantity < lineMax
    })),
    summary: {
        itemsCount: count,
        totalQuantity: quantity,
        itemsTotal,
        shippingCost,
        totalPrice,
        currency
    },
    shipping,
    checkoutable: lines.length > 0 && lines.every(({ availability }) => isBuyable(availability))
});
