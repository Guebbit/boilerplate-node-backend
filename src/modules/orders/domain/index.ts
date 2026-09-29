/**
 * @module
 * Orders — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. Anything testable without a database belongs here; queries, transactions, HTTP envelopes
 * and translated copy do not.
 *
 * See `docs/theory/domain-layer.md`.
 */

export { sumLineItems, orderTotal } from './totals';

/**
 * Integer money arithmetic, published because `payments` and `returns` both do sums on refunds
 * and must not redo them in floating point: a decimal amount goes in through `toMinorUnits`, comes
 * out through `toDecimalAmount`, and everything between stays exact.
 */
export {
    toMinorUnits,
    toDecimalAmount,
    addMoney,
    subtractMoney,
    apportion,
    NO_MONEY
} from './money';
export type { Money } from './money';

export { checkOrderLines, isShippedItem, isDigitalOnlyOrder } from './rules';
export type { ShippableLineCandidate } from './rules';

// `ORDER_LIFECYCLE` is deliberately absent: a caller reading the table directly re-derives an
// answer that already has a name.
export {
    canTransition,
    isPayable,
    stockCommitted,
    statusesReachableFrom,
    statusesLeadingTo,
    orderActionsFor,
    canOverrideTo,
    statusesOverridableInto,
    overridableTargetsFrom
} from './lifecycle';
export type { OrderActor } from './lifecycle';

/** The VAT breakdown an order's response and invoice both derive from its frozen lines. */
export { orderTaxBreakdown } from './tax';
export type { OrderTaxBreakdown, LineTaxBreakdown, TaxableLineItem, TaxRateSummary } from './tax';

/** The RF creditor reference `placeOrder` mints for a `bank_transfer` order, and its admin-side parse. */
export { buildReference, parseReference } from './transfer-reference';
