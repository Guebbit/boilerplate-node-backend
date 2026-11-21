/**
 * @module
 * What a shopper is told about a product's stock, in Google Merchant's words: `availability` and,
 * with `preorder` or `backorder`, the `availabilityDate` it ships. Pure: the clock comes in as an
 * argument. The terms are the product's own settings; the counts are inventory's.
 *
 * @see docs/modules/inventory.md#the-availability-reads
 */

import { DAY_MS } from '@domain-primitives/time';
import { isBackorder } from './backorder';
import { isPreorder, type PreorderFacts } from './preorder';
import { preorderAllowanceLeft } from './stock';

/** The four values of Google's `availability`. `out_of_stock` is every "cannot be ordered" case. */
export type Availability = 'in_stock' | 'out_of_stock' | 'preorder' | 'backorder';

/** The settings of a product that decide its availability; staff edit them. */
export interface AvailabilityTerms extends PreorderFacts {
    /** The switch behind backorder; absent reads `false`. */
    allowBackorder?: boolean | undefined;
    /** When stock is expected back; absent promises `promiseDays` from today. */
    restockDate?: Date | undefined;
    /** Set once the product is soft-deleted: nothing to order. */
    deletedAt?: Date | undefined;
}

/** The counts that decide it, from the product's inventory level. A product with no level reads all zero. */
export interface AvailabilityCounts {
    /** Units on the shelf that nobody has claimed (`onHand − reserved`). */
    available: number;
    /** The cap on owed units; `null` is no cap, absent reads closed. */
    backorderLimit?: number | null | undefined;
    /** Units already owed against the cap. */
    backordered?: number | undefined;
}

/** What a shopper reads: Google's two fields. */
export interface AvailabilityFacts {
    availability: Availability;
    /** An instant the caller shows as the shop's calendar day; present only with `preorder` or `backorder`. */
    availabilityDate?: Date;
}

/**
 * Can the product be ordered at `now`, and if so how?
 *
 * Judged in this order: hidden, deleted or off sale is `out_of_stock`; before its release date it
 * is a `preorder` while the allowance has room (a full one is `out_of_stock`); with shelf units it
 * is `in_stock`; with none, a `backorder` while its switch is on, its restock date has not passed
 * and the cap has room; otherwise `out_of_stock`.
 *
 * @param terms - the product's own settings
 * @param counts - the inventory level's counts
 * @param now - the instant to judge at
 * @param promiseDays - days promised when a backorder names no restock date (`shop`'s `BACKORDER_PROMISE_DAYS`; this layer imports no module)
 */
export const availabilityOf = (
    terms: AvailabilityTerms,
    counts: AvailabilityCounts,
    now: Date,
    promiseDays: number
): AvailabilityFacts => {
    if (terms.deletedAt !== undefined || terms.active === false || terms.purchasable === false)
        return { availability: 'out_of_stock' };

    if (isPreorder(terms, now))
        return preorderAllowanceLeft(counts.backorderLimit, counts.backordered) > 0 &&
            terms.releaseDate
            ? { availability: 'preorder', availabilityDate: terms.releaseDate }
            : { availability: 'out_of_stock' };

    if (counts.available > 0) return { availability: 'in_stock' };

    if (
        preorderAllowanceLeft(counts.backorderLimit, counts.backordered) > 0 &&
        isBackorder(terms, now)
    )
        return {
            availability: 'backorder',
            availabilityDate: terms.restockDate ?? new Date(now.getTime() + promiseDays * DAY_MS)
        };

    return { availability: 'out_of_stock' };
};
