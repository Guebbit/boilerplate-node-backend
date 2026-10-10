/**
 * @module
 * What a saved line can do right now: the one precedence rule behind a cart line, a wishlist line,
 * a merge result and checkout's refusal. Pure.
 *
 * See: docs/modules/cart.md#line-availability
 */

import { fitsStock } from './stock';

/** The contract's `LineAvailability`, spelled out so this layer imports nothing. */
export type LineAvailability =
    | 'in_stock'
    | 'insufficient_stock'
    | 'out_of_stock'
    | 'unavailable'
    | 'removed';

/** What the rule reads off a joined product. */
export interface AvailabilityProduct {
    /** `false` hides the product from shoppers. */
    active?: boolean;
    /** `false` takes it off sale: listed, not buyable. */
    purchasable?: boolean;
    /** Set once the product is soft-deleted. */
    deletedAt?: Date;
}

/** The facts one line is judged on. */
export interface AvailabilityFacts {
    /** The joined product, or `null`/absent when the lookup found nothing (hard-deleted). */
    product: AvailabilityProduct | null | undefined;
    /** Units for sale from the ledger; absent reads as none. */
    available: number | null | undefined;
    /** Units the line holds. Absent for a wishlist line, which can never be `insufficient_stock`. */
    quantity?: number;
}

/**
 * Judge one line. First match wins, in this order: removed, unavailable, out_of_stock,
 * insufficient_stock, in_stock.
 *
 * @param facts - the joined product, the ledger's units and, for a cart line, its quantity
 * @returns the line's availability
 */
export const lineAvailability = ({
    product,
    available,
    quantity
}: AvailabilityFacts): LineAvailability => {
    if (!product || product.active === false || product.deletedAt !== undefined) return 'removed';
    if (product.purchasable === false) return 'unavailable';
    if ((available ?? 0) === 0) return 'out_of_stock';
    if (quantity !== undefined && !fitsStock(quantity, available)) return 'insufficient_stock';
    return 'in_stock';
};
