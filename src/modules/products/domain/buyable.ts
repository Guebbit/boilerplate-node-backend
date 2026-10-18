/**
 * @module
 * Whether a shopper can order a product right now, and the moment that changes. Pure: the clock
 * comes in as an argument.
 *
 * See: docs/modules/products.md#back-in-stock-signal
 */

import { isBackorder, type BackorderFacts } from './backorder';
import { isPreorder } from './preorder';
import { availableStock, preorderAllowanceLeft } from './stock';

/** What the buyable rule reads off a product: the backorder facts plus the synced shelf counters. */
export interface BuyableFacts extends BackorderFacts {
    onHand?: number | undefined;
    reserved?: number | undefined;
}

/**
 * Can the product be ordered at `now`? Visible and buyable, and something to order: shelf units,
 * the room of a preorder's allowance, or an open backorder. This is the one rule "notify me" uses
 * to decide a product is back.
 *
 * @param facts - the product's flags, dates and synced counters
 * @param now - the instant to judge at
 */
export const isBuyable = (facts: BuyableFacts, now: Date): boolean => {
    if (facts.active === false || facts.purchasable === false) return false;
    if (isPreorder(facts, now))
        return preorderAllowanceLeft(facts.backorderLimit, facts.backordered) > 0;
    return availableStock(facts.onHand, facts.reserved) > 0 || isBackorder(facts, now);
};

/**
 * Did an edit turn a product that could not be ordered into one that can?
 *
 * @param before - the product before the change
 * @param after - the product after it
 * @param now - the instant to judge both at
 * @returns `true` only on the flip, never while it stays buyable (or stays not)
 */
export const becameBuyable = (before: BuyableFacts, after: BuyableFacts, now: Date): boolean =>
    !isBuyable(before, now) && isBuyable(after, now);
