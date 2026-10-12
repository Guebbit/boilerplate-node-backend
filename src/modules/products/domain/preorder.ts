/**
 * @module
 * Preorder rules — whether a product is sold before its release date, and how far ahead a date may
 * sit. Pure: a clock comes in as an argument, so every case is testable without waiting.
 *
 * See: docs/modules/products.md#preorder
 */

/** What the preorder rule reads off a product. Absent flags read as their defaults (`true`). */
export interface PreorderFacts {
    /** `false` hides the product: nothing to pre-order. */
    active?: boolean | undefined;
    /** `false` takes it off sale: nothing to pre-order either. */
    purchasable?: boolean | undefined;
    /** When the product ships from; absent means it is simply on sale. */
    releaseDate?: Date | undefined;
}

/**
 * Is the product a preorder at `now`? Derived, never stored: the day the date passes it stops
 * being one, with no job to run — BigCommerce and WooCommerce both auto-revert the same way.
 *
 * @param facts - the product's visibility, saleability and release date
 * @param now - the instant to judge at
 * @returns `true` while it is on sale and its release date is still ahead
 */
export const isPreorder = (facts: PreorderFacts, now: Date): boolean =>
    facts.active !== false &&
    facts.purchasable !== false &&
    facts.releaseDate !== undefined &&
    facts.releaseDate.getTime() > now.getTime();

/**
 * The latest release date a product may be given at `now`: one year ahead, Google's
 * `availability_date` rule. Calendar years in UTC, so a leap day cannot shift the bound by a day.
 *
 * @param now - the instant the write happens at
 */
export const latestReleaseDate = (now: Date): Date => {
    const latest = new Date(now);
    latest.setUTCFullYear(latest.getUTCFullYear() + 1);
    return latest;
};
