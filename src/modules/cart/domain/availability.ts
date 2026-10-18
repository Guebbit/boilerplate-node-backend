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
    | 'preorder'
    | 'backorder'
    | 'removed';

/** What the rule reads off a joined product. */
export interface AvailabilityProduct {
    /** `false` hides the product from shoppers. */
    active?: boolean;
    /** `false` takes it off sale: listed, not buyable. */
    purchasable?: boolean;
    /** Set once the product is soft-deleted. */
    deletedAt?: Date;
    /** On sale before its release date: `available` then counts what is left of its allowance. */
    preorder?: boolean;
    /** Released and open to backorder with room under the cap: a line may spill past the shelf. */
    backorder?: boolean;
}

/** The facts one line is judged on. */
export interface AvailabilityFacts {
    /** The joined product, or `null`/absent when the lookup found nothing (hard-deleted). */
    product: AvailabilityProduct | null | undefined;
    /**
     * Units for sale from the ledger — the allowance left for a preorder, the shelf and the room
     * together for a product open to backorder; absent reads as none.
     */
    available: number | null | undefined;
    /** Units on the shelf alone, which only a backorder product reads; absent reads as none. */
    shelf?: number | null | undefined;
    /** Units the line holds. Absent for a wishlist line, which can never be `insufficient_stock`. */
    quantity?: number;
}

/**
 * Judge one line. First match wins, in this order: removed, unavailable, out_of_stock,
 * insufficient_stock, preorder, backorder, in_stock. A preorder is judged against its allowance,
 * so `out_of_stock` for one means the allowance is full, not that the shelf is empty. A product
 * open to backorder is judged against shelf and room together, and reads `backorder` when the
 * line asks for more than the shelf holds (a wishlist line, with no quantity, when the shelf is
 * empty).
 *
 * @param facts - the joined product, the ledger's units and, for a cart line, its quantity
 * @returns the line's availability
 */
export const lineAvailability = ({
    product,
    available,
    shelf,
    quantity
}: AvailabilityFacts): LineAvailability => {
    if (!product || product.active === false || product.deletedAt !== undefined) return 'removed';
    if (product.purchasable === false) return 'unavailable';
    if ((available ?? 0) === 0) return 'out_of_stock';
    if (quantity !== undefined && !fitsStock(quantity, available)) return 'insufficient_stock';
    if (product.preorder) return 'preorder';
    if (product.backorder && (quantity === undefined ? (shelf ?? 0) <= 0 : quantity > (shelf ?? 0)))
        return 'backorder';
    return 'in_stock';
};
