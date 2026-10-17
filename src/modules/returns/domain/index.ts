/**
 * @module
 * Returns — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. See `docs/theory/domain-layer.md`.
 */

export {
    DECIDABLE_RETURN_STATUSES,
    RECEIVABLE_RETURN_STATUSES,
    CLOSABLE_RETURN_STATUSES,
    QUANTITY_HOLDING_RETURN_STATUSES,
    BACK_RETURN_STATUSES,
    holdsReturnedGoods,
    initialStatusFor
} from './lifecycle';
export type { ReturnStatus, ReturnReason, ReturnKind } from './lifecycle';

export {
    returnableQuantities,
    quantitiesByProduct,
    returnableLinesOf,
    wireLines,
    checkRequestedLines,
    takesLastUnit
} from './quantities';
export type { ProductQuantity, LinesVerdict } from './quantities';

export {
    CONFORMITY_REASONS,
    WITHDRAWAL_WINDOW_REASONS,
    isGuaranteeReason,
    isReasonOpen,
    reasonsOpenAt
} from './reasons';
export type { FrozenDeadlines } from './reasons';

export { projectReturnStatus } from './status-projection';
export type { ProjectedReturn, ProjectedReturnStatus } from './status-projection';

export { refundAmountFor, cancellationRefundFor, shippingStillOwed } from './refund-amount';
export type {
    RefundInputs,
    RefundBreakdown,
    RefundVerdict,
    CancellationInputs
} from './refund-amount';

export { accountsOf } from './accounting';
export type { AccountedReturn, OrderAccounts } from './accounting';
