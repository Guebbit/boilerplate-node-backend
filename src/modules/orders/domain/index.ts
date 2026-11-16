/**
 * @module
 * Orders — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. Anything testable without a database belongs here; queries, transactions, HTTP envelopes
 * and translated copy do not.
 *
 * @see docs/understand/domain-layer.md#_1-the-folder
 */

export { sumLineItems, orderTotal } from './totals';

export { hardDeletable, softDeletable } from './deletion';
export type { DeletionCandidate } from './deletion';

export { AUTOMATIC_PURCHASE_HOLD_MAX_DAYS, purchaseHoldUntil } from './purchase-hold';

export { owedLineOf } from './backorder';
export type { OwedLine } from './backorder';

export { buyerIdOf, checkOrderLines, isBuyer, isShippedItem, isDigitalOnlyOrder } from './rules';
export type { ShippableLineCandidate } from './rules';

/**
 * `ORDER_EVENTS` is published for reading; a sibling module asks a named predicate
 * (`isPayable`, `canProcessOrder`, ...) and never lists statuses or reads the table itself.
 */
export {
    ORDER_EVENTS,
    UNDELIVERABLE_EVENT,
    canTransition,
    isPayable,
    canProcessOrder,
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
    WITHDRAWAL_REFUND_DAYS,
    WITHDRAWAL_SEND_BACK_DAYS,
    isBeforeDispatch,
    conformityUntilFrom,
    repairedConformityUntil,
    deliveryClockFor,
    isExcludedFromWithdrawal,
    withdrawUntilFrom,
    withdrawalClosesAt,
    withdrawalRefundDueBy,
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
    shipsAwaitedStock,
    settlementFor
} from './fulfillment';
export type { FulfillmentSummary, FulfillmentFilter, SettlementMove } from './fulfillment';

/** What each status means, declared once and total over the contract's statuses. */
export { ORDER_STATUS_TRAITS, statusesWhere } from './status-traits';
export type { OrderStatusTraits } from './status-traits';

/** What an order's timeline may say, and which audience each type is for. */
export { TIMELINE_AUDIENCE, BUYER_VISIBLE_TYPES, isBuyerVisible } from './timeline';
export type { OrderTimelineEntryAudience, OrderTimelineType, TimelineEntryInput } from './timeline';

/** The orders CSV: its columns, and one order as one row. */
export { ORDER_CSV_COLUMNS, toOrderCsvRow } from './export';
export type { OrderCsvColumn, OrderCsvSource } from './export';
