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
 * Integer money arithmetic, published because `payments`, `returns` and `invoicing` all do sums on
 * refunds and must not redo them in floating point: a decimal amount goes in through `toMinorUnits`, comes
 * out through `toDecimalAmount`, and everything between stays exact.
 */
export {
    toMinorUnits,
    toDecimalAmount,
    addMoney,
    subtractMoney,
    scaleMoney,
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
    paymentSettled,
    statusesReachableFrom,
    statusesLeadingTo,
    orderActionsFor,
    canOverrideTo,
    statusesOverridableInto,
    overridableTargetsFrom
} from './lifecycle';
export type { OrderActor } from './lifecycle';

/** The VAT breakdown an order's response and invoice both derive from its frozen lines. */
export { orderTaxBreakdown, lineTaxFromRateTotals } from './tax';
export type { OrderTaxBreakdown, LineTaxBreakdown, TaxableLineItem, TaxRateSummary } from './tax';

/** The RF creditor reference `placeOrder` mints for a `bank_transfer` order, and its admin-side parse. */
export { buildReference, parseReference } from './transfer-reference';

/** The right of withdrawal: when the window closes, and whether the button shows. */
export {
    canWithdraw,
    isBeforeDispatch,
    isExcludedFromWithdrawal,
    withdrawUntilFrom,
    withdrawalStartFor
} from './withdrawal';
export type { WithdrawalCandidate, WithdrawableLine, WithdrawalClockCandidate } from './withdrawal';

/** The money and the return stamped beside `status`. */
export { paymentStatusOf, returnStatusOf } from './projections';
export type { StampedPaymentStatus, StampedReturnStatus } from './projections';

/** What `delivery` reports about the goods, and what `orders` reads off it. */
export { NO_FULFILLMENT, fulfillmentStatusOf, fulfillmentStatusFilter } from './fulfillment';
export type { FulfillmentSummary, FulfillmentFilter } from './fulfillment';
