/**
 * @module
 * Orders — domain layer. Pure rules, lint-guaranteed free of Express, Mongoose and every tier.
 *
 * What belongs here: anything testable without a database.
 * What does not: queries, transactions, HTTP envelopes, translated copy.
 *
 * See `docs/theory/domain-layer.md`.
 */

// `toCents` is deliberately absent: `sumLineItems` is its only caller, and `totals.ts` is where
// its property test reaches it. A barrel line would make it look like a rule others may use.
export { sumLineItems, orderTotal } from './totals';

export { checkOrderLines } from './rules';

// `ORDER_LIFECYCLE` is deliberately absent: a caller reading the table directly re-derives an
// answer that already has a name.
export {
    canTransition,
    statusesReachableFrom,
    statusesLeadingTo,
    orderActionsFor
} from './lifecycle';
export type { OrderActor } from './lifecycle';
