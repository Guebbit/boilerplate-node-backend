/**
 * @module
 * The label a payment shows (Shopify's `displayFinancialStatus`), derived from the stored status
 * and its refund records, plus the stored-field query behind each label. The two are written side
 * by side because they must agree: the integration suite checks every label both ways.
 *
 * Why not `amountRefunded`: it counts a refund the moment it is opened, so a requested refund
 * would read as done.
 */

import { PaymentDisplayStatus, RefundStatus, type PaymentStatus } from '@types';
import { OPEN_REFUND_STATUSES } from './lifecycle';

/** The slice of a payment the label reads. */
export interface DisplayStatusInput {
    status: PaymentStatus;
    refunds: readonly { status: RefundStatus }[];
}

/**
 * The label for one payment.
 * @param payment - its stored status and refund records
 * @returns the label; an open refund wins over the status
 */
export const displayStatusOf = ({ status, refunds }: DisplayStatusInput): PaymentDisplayStatus => {
    if (refunds.some((refund) => OPEN_REFUND_STATUSES.includes(refund.status)))
        return PaymentDisplayStatus.refund_pending;
    if (status === 'refunded') return PaymentDisplayStatus.refunded;
    if (status === 'succeeded')
        return refunds.some((refund) => refund.status === RefundStatus.succeeded)
            ? PaymentDisplayStatus.partially_refunded
            : PaymentDisplayStatus.succeeded;
    if (status === 'processing') return PaymentDisplayStatus.pending;
    return status === 'declined' ? PaymentDisplayStatus.failed : PaymentDisplayStatus.incomplete;
};

/** A payment holds a refund still open. */
const HAS_OPEN_REFUND = { refunds: { $elemMatch: { status: { $in: [...OPEN_REFUND_STATUSES] } } } };

/** A payment holds no refund still open. */
const NO_OPEN_REFUND = { refunds: { $not: HAS_OPEN_REFUND.refunds } };

/** The stored-field query behind each label — the inverse of {@link displayStatusOf}. */
const FILTERS: Record<PaymentDisplayStatus, Record<string, unknown>> = {
    [PaymentDisplayStatus.refund_pending]: HAS_OPEN_REFUND,
    [PaymentDisplayStatus.refunded]: { $and: [{ status: 'refunded' }, NO_OPEN_REFUND] },
    [PaymentDisplayStatus.partially_refunded]: {
        $and: [
            { status: 'succeeded' },
            { refunds: { $elemMatch: { status: RefundStatus.succeeded } } },
            NO_OPEN_REFUND
        ]
    },
    [PaymentDisplayStatus.succeeded]: { status: 'succeeded', refunds: { $size: 0 } },
    [PaymentDisplayStatus.pending]: { $and: [{ status: 'processing' }, NO_OPEN_REFUND] },
    [PaymentDisplayStatus.failed]: { $and: [{ status: 'declined' }, NO_OPEN_REFUND] },
    [PaymentDisplayStatus.incomplete]: {
        $and: [{ status: { $in: ['requires_confirmation', 'requires_action'] } }, NO_OPEN_REFUND]
    }
};

/**
 * The stored-field query for one label.
 * @param label - what the page filters by
 * @returns a Mongo filter over payments
 */
export const displayStatusFilter = (label: PaymentDisplayStatus): Record<string, unknown> =>
    FILTERS[label];
