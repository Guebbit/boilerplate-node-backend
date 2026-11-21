/**
 * @module
 * Backorder rules — whether a RELEASED product keeps selling while its shelf is empty. Pure: a clock
 * comes in as an argument, so every case is testable without waiting.
 *
 * @see docs/modules/products.md#backorder
 */

import { isPreorder, type PreorderFacts } from './preorder';

/** What the backorder rule reads off a product. Absent flags read as their defaults. */
export interface BackorderFacts extends PreorderFacts {
    /** The switch; absent reads `false`. */
    allowBackorder?: boolean | undefined;
    /** When stock is expected back; a passed one reads sold out until staff set a new one or clear it. */
    restockDate?: Date | undefined;
}

/**
 * Can the product be bought on backorder at `now`? Derived, never stored. The product's TERMS
 * only: the switch is on, it is visible, buyable and already released, and its restock date has
 * not passed (a missed date is evidence the shop lacks a basis to promise another, so it reads
 * sold out). The allowance is not judged here: it is `inventory`'s, enforced by `availableFor`,
 * and the availability rule adds it for its own answer.
 *
 * @param facts - the product's switch, date, visibility and saleability
 * @param now - the instant to judge at
 * @returns `true` while the product's terms allow an order against the allowance
 */
export const isBackorder = (facts: BackorderFacts, now: Date): boolean =>
    facts.allowBackorder === true &&
    facts.active !== false &&
    facts.purchasable !== false &&
    !isPreorder(facts, now) &&
    (facts.restockDate === undefined || facts.restockDate.getTime() > now.getTime());
