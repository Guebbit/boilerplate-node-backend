/**
 * @module
 * Returns — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier.
 *
 * @see docs/understand/domain-layer.md#_1-the-folder
 */

export {
    RETURN_EVENTS,
    returnLifecycle,
    QUANTITY_HOLDING_RETURN_STATUSES,
    BACK_RETURN_STATUSES,
    holdsReturnedGoods,
    handsUnitsBack,
    initialStatusFor
} from './lifecycle';
export type {
    ReturnEvent,
    ReturnStatus,
    ReturnReason,
    ReturnKind,
    ReturnRemedy
} from './lifecycle';

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
    policyExceptionsOf,
    reasonsOpenAt
} from './reasons';
export type { FrozenDeadlines } from './reasons';

export { checkStatement } from './statement';
export type { Statement, StatementInput, StatementVerdict } from './statement';

export { resolveRestock } from './restock';
export type { RestockRequest, RestockVerdict } from './restock';

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

export {
    PROOF_OPENS_REFUND_FOR,
    proofOpenedRefund,
    proofOpensRefund,
    refundDueByOf
} from './refund-due';
export type { RefundDueInput, ReturnRefundDue } from './refund-due';
