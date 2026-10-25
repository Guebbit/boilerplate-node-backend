/**
 * @module
 * When an invoice's buyer block stops being needed: the tax clock, as a pure rule.
 *
 * Tax record periods run to the end of the year the document belongs to, plus N years (IT art. 2220
 * c.c., DE, FR). So a document is due on 1 January of (issue year + N + 1), in the zone it was
 * issued in. `issuedAt + N * 365 days` would run up to a year early.
 *
 * See: docs/theory/data-retention.md#invoices-the-tax-clock
 */

import { DAY_MS, dayInZone, zonedStartOfDay } from '@domain-primitives/time';

/**
 * The instant a document's buyer block is due to go: local midnight of 1 January, N + 1 years
 * after the year it was issued in.
 *
 * @param issuedAt - when the document was issued
 * @param timezone - the IANA zone frozen on the document; its calendar decides the issue year
 * @param years - how many full years the buyer block is kept after the issue year ends
 */
export const buyerRetentionEnd = (issuedAt: Date, timezone: string, years: number): Date => {
    const issueYear = Number(dayInZone(issuedAt, timezone).slice(0, 4));
    return zonedStartOfDay(issueYear + years + 1, 1, 1, timezone);
};

/**
 * Whether a document's buyer block is past its retention.
 *
 * @param document - the two frozen fields the rule reads
 * @param years - the retention in years
 * @param now - the moment to judge against
 */
export const isBuyerRetentionOver = (
    document: { issuedAt: Date; timezone: string },
    years: number,
    now: Date
): boolean => now >= buyerRetentionEnd(document.issuedAt, document.timezone, years);

/**
 * An `issuedAt` bound no due document can sit at or after, for a cheap index scan before the exact
 * rule runs. A document is due only once the shop-zone year reaches issue year + N + 1; the zone
 * year is at most the UTC year of tomorrow, and a local 1 January is before 2 January UTC.
 *
 * @param years - the retention in years
 * @param now - the moment to judge against
 */
export const buyerRetentionScanBound = (years: number, now: Date): Date => {
    const tomorrow = new Date(now.getTime() + DAY_MS);
    return new Date(Date.UTC(tomorrow.getUTCFullYear() - years, 0, 2));
};
