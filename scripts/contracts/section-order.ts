/**
 * The order a bundle lists its per-module sections in — pure, so a test can walk it.
 *
 * Why an order at all: a bundle's diff (and the PHP twin's, and the frontend's) stays small when
 * sections keep their historical places. The list each bundler passes is a PREFERENCE, never a
 * registry: a module that is not deployed (deleted, e.g. by `demo:remove`) drops out, and a
 * module the list has never heard of is appended alphabetically. Nothing to keep in step by hand.
 *
 * See: docs/theory/module-lifecycle.md
 */

/**
 * The sections to bundle, in order.
 * @param preferred - the historical order; entries for modules that do not exist are ignored
 * @param present - every section that really exists on disk
 * @returns the preferred sections that exist, then every other one alphabetically
 */
export const orderSections = (
    preferred: readonly string[],
    present: readonly string[]
): string[] => {
    const known = preferred.filter((section) => present.includes(section));
    const extra = present.filter((section) => !preferred.includes(section)).toSorted();
    return [...known, ...extra];
};
