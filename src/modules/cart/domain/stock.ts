/**
 * @module
 * The cart's stock rules: does a line's quantity fit what can be bought, and how far a write is
 * clamped when it does not. Pure.
 *
 * Callers share them, so they cannot disagree: checkout's pre-flight (refuses), the cart writes
 * and the merge (clamp). `quantityAvailable` comes in from the service layer, which reads
 * inventory's availability; this layer reaches no sibling module.
 *
 * @see docs/modules/cart.md#stock-checked-in-three-places
 */

/** Shopify's `CartWarning` codes, the spelling the contract's `CartWarningCode` enum keeps. */
export type StockWarningCode = 'MERCHANDISE_NOT_ENOUGH_STOCK' | 'MERCHANDISE_OUT_OF_STOCK';

/** What a clamp decided for one line. */
export interface StockClamp {
    /** What the line holds after the write. */
    quantity: number;
    /** Absent when the write landed as asked. */
    code?: StockWarningCode;
}

/**
 * Does `quantity` fit what is for sale?
 *
 * Equal fits. An unknown availability (`null` or absent: the product is gone or hidden) fits
 * nothing, "nothing to sell" being the safe direction to be wrong in for a rule that guards a
 * purchase. Callers turn the verdict into a refusal or a flag.
 *
 * @param quantity - units the line holds
 * @param available - units a customer may buy right now, or `null` when unknown
 * @returns `true` when the whole quantity can be sold
 */
export const fitsStock = (quantity: number, available: number | null | undefined): boolean =>
    quantity <= (available ?? 0);

/**
 * How far a write may go: `wanted` units, but no more than can be bought. A line already above the
 * number is never lowered by a write that did not ask for it: the ceiling is the larger of the
 * number and what the line holds, so lowering stays allowed and raising stops at the held quantity.
 *
 * The code is Shopify's: `MERCHANDISE_OUT_OF_STOCK` when none can be bought, otherwise
 * `MERCHANDISE_NOT_ENOUGH_STOCK`.
 *
 * @param wanted - what the write asks the line to hold (already within the per-line ceiling)
 * @param held - what the line holds now, `0` for no line
 * @param quantityAvailable - how many can be bought now; `undefined` is no limit
 * @returns what the line holds after the write, and the warning when that is less than `wanted`
 */
export const clampToStock = (
    wanted: number,
    held: number,
    quantityAvailable: number | undefined
): StockClamp => {
    if (quantityAvailable === undefined) return { quantity: wanted };
    const quantity = Math.min(wanted, Math.max(held, quantityAvailable));
    if (quantity === wanted) return { quantity };
    return {
        quantity,
        code: quantityAvailable === 0 ? 'MERCHANDISE_OUT_OF_STOCK' : 'MERCHANDISE_NOT_ENOUGH_STOCK'
    };
};

/** What decides which units of a line ship later. */
export interface ShipsLaterFacts {
    /** The product is a preorder right now: every unit ships from its release date. */
    preorder: boolean;
    /** Released and open to backorder: units past the shelf ship when stock returns. */
    backorder: boolean;
    /** Units on the shelf nobody has claimed. */
    shelf: number;
    /** Units the line holds. */
    quantity: number;
}

/**
 * How many units of a line ship later: all of a preorder's, and what a backorder line asks past
 * the shelf (Magento's `qty_backordered`). `undefined` for none, so a line it is not true for
 * carries no field.
 *
 * @param facts - the product's mode, the shelf and the line's quantity
 * @returns the units that ship later, or `undefined` when none do
 */
export const unitsShippingLater = ({
    preorder,
    backorder,
    shelf,
    quantity
}: ShipsLaterFacts): number | undefined => {
    const later = preorder ? quantity : backorder ? Math.max(0, quantity - shelf) : 0;
    return later > 0 ? later : undefined;
};
