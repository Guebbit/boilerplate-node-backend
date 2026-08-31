/**
 * @module
 * Orders — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. Anything testable without a database belongs here; queries, transactions, HTTP envelopes
 * and translated copy do not.
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
