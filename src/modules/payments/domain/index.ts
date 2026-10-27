/**
 * @module
 * Payments — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. The status vocabulary is 6-wide, past the threshold that makes a `domain/` folder
 * mandatory, so it gets one rather than living as a scattered constant beside each write that
 * reads it.
 *
 * See `docs/theory/domain-layer.md`.
 */

export {
    CONFIRMABLE_PAYMENT_STATUSES,
    IN_FLIGHT_PAYMENT_STATUSES,
    SETTLEABLE_PAYMENT_STATUSES,
    SUCCESS_SETTLEABLE_PAYMENT_STATUSES,
    REAPABLE_PAYMENT_STATUSES,
    REFUNDABLE_PAYMENT_STATUS,
    MANUAL_PROVIDER,
    isHandRecorded,
    isOpenTransfer,
    OPEN_REFUND_STATUSES,
    isOpenRefund,
    mayBeCanceled,
    refundDueBy,
    FINAL_REFUND_FAILURES,
    UNCLEAR_REFUND_FAILURES,
    isFinalFailure,
    isReversed,
    owesBuyerAnotherWay,
    exceedsRemaining,
    exceedsBy,
    MONEY_DID_NOT_MOVE_FAILURES,
    mayBeSettledByHand,
    nextRefundAttemptAt
} from './lifecycle';

/** The dispute rules: what an open or lost chargeback allows. */
export {
    OPEN_DISPUTE_STATUSES,
    openDisputeFilter,
    isOpenDispute,
    hasOpenDispute,
    hasOpenChargeback,
    lostToChargebacks,
    lostChargebackCovers,
    hasDecidedDispute
} from './disputes';
export type { DisputeFacts, DisputablePayment } from './disputes';

/** The RF creditor reference a bank-transfer payment carries, and its admin-side parse. */
export { buildReference, parseReference } from './transfer-reference';

/** The label a payment shows, and the query behind each label. */
export { displayStatusOf, displayStatusFilter } from './display-status';
export type { DisplayStatusInput } from './display-status';
