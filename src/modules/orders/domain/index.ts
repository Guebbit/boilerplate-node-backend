/**
 * Orders — domain layer. Pure rules, lint-guaranteed free of Express, Mongoose and every tier.
 *
 * What belongs here: anything testable without a database.
 * What does not: queries, transactions, HTTP envelopes, translated copy.
 *
 * See `docs/theory/domain-layer.md`.
 */

export { sumLineItems, toCents } from './totals';
export type { ILineItem, ILineItemTotals } from './totals';

export { checkOrderLines, nextDeletionState, readScope } from './rules';
export type { IOrderLineCandidate, TOrderLinesVerdict } from './rules';
