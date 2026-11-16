/**
 * @module
 * Cart merge rule. Pure: what one guest line becomes, given what the cart holds and whether the
 * product is listed. The cap is passed in — this layer reaches neither the catalogue nor the model.
 *
 * @see docs/understand/domain-layer.md#the-rule-enforced-by-lint
 */

import type { MergeLineReason } from '@types';

/** What one guest line asks the rule to decide on. */
export interface MergeLineFacts {
    /** What the guest line asked for. */
    requested: number;
    /** What the cart already holds of the product. */
    held: number;
    /**
     * Whether the product is publicly visible. A deleted or hidden one takes no line; one merely
     * off sale is listed and takes one.
     */
    listed: boolean;
    /** The per-line ceiling. */
    lineMax: number;
    /** How many lines the cart holds now. */
    lines: number;
    /** The most lines a cart may hold. */
    maxLines: number;
}

/** The rule's verdict for one line. */
export interface MergePlan {
    /** Units to add to the cart; `0` writes nothing. */
    add: number;
    /** Absent when the line lands exactly as asked. */
    reason?: MergeLineReason;
}

/**
 * Decide what one guest line adds to the cart: what `POST /cart/items` would add, no more.
 *
 * Stock plays no part (the linked page says where it is checked). A sold-out or short product is
 * added like any other and flagged by the caller through `fitsStock`; lowering the line to what is
 * for sale would let a caller read exact stock by merging 999. When several reasons apply the one
 * reported is the first that does: `removed` (nothing is added at all), `cart_full` (a new
 * product, and no line left for it: nothing is added either), `capped`, `summed`. `capped` says
 * the shopper got less than they asked for; `summed` is context.
 *
 * @see docs/modules/cart.md#stock-checked-in-three-places
 * @param facts - the line, what the cart holds, how full it is, and whether the product is listed
 * @returns how many units to add, and the one reason to report
 */
export const planMergeLine = ({
    requested,
    held,
    listed,
    lineMax,
    lines,
    maxLines
}: MergeLineFacts): MergePlan => {
    if (!listed) return { add: 0, reason: 'removed' };
    if (held === 0 && lines >= maxLines) return { add: 0, reason: 'cart_full' };

    const wanted = held + requested;
    const target = Math.min(wanted, lineMax);
    const add = target - held;

    if (target < wanted) return { add, reason: 'capped' };
    if (held > 0) return { add, reason: 'summed' };
    return { add };
};
