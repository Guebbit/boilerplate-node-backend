/**
 * @module
 * Orders — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. Anything testable without a database belongs here; queries, transactions, HTTP envelopes
 * and translated copy do not.
 *
 * See `docs/theory/domain-layer.md`.
 */

export { sumLineItems, orderTotal } from './totals';

export { purchaseHoldUntil } from './purchase-hold';

export { owedLineOf, DEFAULT_BACKORDER_PROMISE_DAYS } from './backorder';
export type { OwedLine } from './backorder';

export {
    buyerIdOf,
    checkOrderLines,
    isBuyer,
    isSellable,
    isShippedItem,
    isDigitalOnlyOrder
} from './rules';
export type { ShippableLineCandidate } from './rules';

// `ORDER_EVENTS` is published for reading; a sibling module asks a named predicate
// (`isPayable`, `canStartFulfilment`, ...) and never lists statuses or reads the table itself.
export {
    ORDER_EVENTS,
    canTransition,
    isPayable,
    canStartFulfilment,
    isAwaitingGoods,
    canShip,
    canRecordArrival,
    hasShopStarted,
    paymentSettled,
    statusesReachableFrom,
    statusesLeadingTo,
    orderActionsFor,
    canOverrideTo,
    overridableTargetsFrom
} from './lifecycle';
export type { OrderActor, OrderEvent, OrderEventName } from './lifecycle';

/** The VAT breakdown an order's response and invoice both derive from its frozen lines. */
export { orderTaxBreakdown, lineTaxFromRateTotals } from './tax';
export type { OrderTaxBreakdown, LineTaxBreakdown, TaxableLineItem, TaxRateSummary } from './tax';

/** The right of withdrawal: when the window closes, and whether the button shows. */
export {
    canCorrectAddress,
    canWithdraw,
    isBeforeDispatch,
    conformityUntilFrom,
    deliveryClockFor,
    isExcludedFromWithdrawal,
    withdrawUntilFrom,
    withdrawalRefusalOf,
    withdrawalStartFor
} from './withdrawal';
export type {
    AddressCandidate,
    DeliveryClock,
    WithdrawalCandidate,
    WithdrawableLine,
    WithdrawalClockCandidate
} from './withdrawal';

/** The money and the return stamped beside `status`, and the filters that are their inverse. */
export {
    paymentStatusOf,
    returnStatusOf,
    paymentStatusFilter,
    returnStatusFilter
} from './projections';
export type { StampedPaymentStatus, StampedReturnStatus } from './projections';

/** What `delivery` reports about the goods, and what `orders` reads off it. */
export {
    NO_FULFILLMENT,
    fulfillmentStatusOf,
    fulfillmentStatusFilter,
    shipsAwaitedStock
} from './fulfillment';
export type { FulfillmentSummary, FulfillmentFilter } from './fulfillment';

/** What each status means, declared once and total over the contract's statuses. */
export { ORDER_STATUS_TRAITS, statusesWhere } from './status-traits';
export type { OrderStatusTraits } from './status-traits';

/** The shop-calendar year of an instant: the year every numbered series is cut at. */
export { yearInZone, zonedStartOfDay } from './shop-time';

/** What an order's timeline may say, and which audience each type is for. */
export { TIMELINE_AUDIENCE, isBuyerVisible } from './timeline';
export type { TimelineAudience, TimelineEntryInput } from './timeline';

/** The orders CSV: its columns, and one order as one row. */
export { ORDER_CSV_COLUMNS, toOrderCsvRow } from './export';
export type { OrderCsvColumn, OrderCsvSource } from './export';
