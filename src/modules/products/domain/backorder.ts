/**
 * @module
 * Backorder rules — whether a RELEASED product keeps selling while its shelf is empty. Pure: a clock
 * comes in as an argument, so every case is testable without waiting.
 *
 * See: docs/modules/products.md#backorder
 */

import { preorderAllowanceLeft } from './stock';
import { isPreorder, type PreorderFacts } from './preorder';

/** What the backorder rule reads off a product. Absent flags read as their defaults. */
export interface BackorderFacts extends PreorderFacts {
    /** The switch; absent reads `false`. */
    allowBackorder?: boolean | undefined;
    /** When stock is expected back; a passed one reads sold out until staff set a new one or clear it. */
    restockDate?: Date | undefined;
    /** The synced copy of `inventory`'s cap; `null` is no cap, absent reads closed. */
    backorderLimit?: number | null | undefined;
    /** The synced copy of the units already owed against it. */
    backordered?: number | undefined;
}

/**
 * Can the product be bought on backorder at `now`? Derived, never stored. The switch is on, the
 * product is visible, buyable and already released, its restock date has not passed (a missed date
 * is evidence the shop lacks a basis to promise another, so it reads sold out), and the cap has
 * room. A shelf that still has units does not matter here: the line decides how much of it spills.
 *
 * @param facts - the product's switch, date, visibility, saleability and cap
 * @param now - the instant to judge at
 * @returns `true` while an order for it may be placed against the cap
 */
export const isBackorder = (facts: BackorderFacts, now: Date): boolean =>
    facts.allowBackorder === true &&
    facts.active !== false &&
    facts.purchasable !== false &&
    !isPreorder(facts, now) &&
    (facts.restockDate === undefined || facts.restockDate.getTime() > now.getTime()) &&
    preorderAllowanceLeft(facts.backorderLimit, facts.backordered) > 0;
