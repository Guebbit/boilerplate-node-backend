/**
 * @module
 * Cart merge rule. Pure: what one guest line becomes, given what the cart holds and whether the
 * product is listed. The cap is passed in — this layer reaches neither the catalogue nor the model.
 *
 * @see docs/understand/domain-layer.md#the-rule-enforced-by-lint
 */

import type { MergeLineReason } from '@types';
import { clampToStock, type StockWarningCode } from './stock';

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
    /** How many can be bought now; `undefined` is no limit. */
    quantityAvailable: number | undefined;
}

/** The rule's verdict for one line. */
export interface MergePlan {
    /** Units to add to the cart; `0` writes nothing. */
    add: number;
    /** Absent when the line lands exactly as asked, and when stock alone added nothing (`stock` says why). */
    reason?: MergeLineReason;
    /** Set when stock held the line back; `wanted` is then what it would hold without that limit. */
    stock?: { code: StockWarningCode; wanted: number };
}

/**
 * Decide what one guest line adds to the cart: what `POST /cart/items` would add, no more, and no
 * more than can be bought.
 *
 * Stock clamps ({@link clampToStock}) after the per-line ceiling: a line asking for more than can
 * be bought is added up to that number, and a product that cannot be bought adds nothing; the
 * caller warns for either. A line already above the number is never lowered by a merge. When
 * several reasons apply the one reported is the first that does: `removed` (nothing is added at
 * all), `cart_full` (a new product, and no line left for it: nothing is added either), `capped`,
 * `summed`. `capped` says the shopper got less than they asked for; `summed` is context.
 *
 * @see docs/modules/cart.md#stock-checked-in-three-places
 * @param facts - the line, what the cart holds, how full it is, and whether the product is listed
 * @returns how many units to add, the one reason to report, and the stock verdict
 */
export const planMergeLine = ({
    requested,
    held,
    listed,
    lineMax,
    lines,
    maxLines,
    quantityAvailable
}: MergeLineFacts): MergePlan => {
    if (!listed) return { add: 0, reason: 'removed' };
    if (held === 0 && lines >= maxLines) return { add: 0, reason: 'cart_full' };

    const wanted = held + requested;
    const target = Math.min(wanted, lineMax);
    const { quantity, code } = clampToStock(target, held, quantityAvailable);
    const add = quantity - held;
    const stock = code === undefined ? {} : { stock: { code, wanted: target } };

    // Stock alone kept the line from growing: the warning says why, a reason would only repeat it.
    if (add === 0 && code !== undefined) return { add, ...stock };
    if (target < wanted) return { add, reason: 'capped', ...stock };
    if (held > 0) return { add, reason: 'summed', ...stock };
    return { add, ...stock };
};
