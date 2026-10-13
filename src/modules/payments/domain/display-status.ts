/**
 * @module
 * The label a payment shows (Shopify's `displayFinancialStatus`), derived from the stored status
 * and its refund records, plus the stored-field query behind each label. The two are written side
 * by side because they must agree: the integration suite checks every label both ways.
 *
 * `amountRefunded` counts a refund the moment it is opened, so a requested refund would read as
 * done. It is read only once no refund is open: then equal to `amount` means every unit went back,
 * which the stored status no longer says (a refunded payment stays `succeeded`).
 */

import { toMinorUnits } from '@shared-kernel/money';
import { PaymentDisplayStatus, RefundStatus, type PaymentStatus } from '@types';
import { OPEN_REFUND_STATUSES } from './lifecycle';

/** The slice of a payment the label reads. */
export interface DisplayStatusInput {
    status: PaymentStatus;
    amount: number;
    amountRefunded: number;
    currency: string;
    refunds: readonly { status: RefundStatus }[];
}

/**
 * The label for one payment.
 * @param payment - its stored status, refund records and the amounts they are read against
 * @returns the label; an open refund wins over the status
 */
export const displayStatusOf = ({
    status,
    refunds,
    amount,
    amountRefunded,
    currency
}: DisplayStatusInput): PaymentDisplayStatus => {
    if (refunds.some((refund) => OPEN_REFUND_STATUSES.includes(refund.status)))
        return PaymentDisplayStatus.refund_pending;
    if (status === 'succeeded') {
        if (refunds.every((refund) => refund.status !== RefundStatus.succeeded))
            return PaymentDisplayStatus.succeeded;
        return toMinorUnits(amountRefunded, currency) === toMinorUnits(amount, currency)
            ? PaymentDisplayStatus.refunded
            : PaymentDisplayStatus.partially_refunded;
    }
    if (status === 'processing') return PaymentDisplayStatus.pending;
    if (status === 'cancelled') return PaymentDisplayStatus.cancelled;
    return status === 'declined' ? PaymentDisplayStatus.failed : PaymentDisplayStatus.incomplete;
};

/** A payment holds a refund still open. */
const HAS_OPEN_REFUND = { refunds: { $elemMatch: { status: { $in: [...OPEN_REFUND_STATUSES] } } } };

/** A payment holds at least one settled refund. */
const SETTLED_REFUND = { refunds: { $elemMatch: { status: RefundStatus.succeeded } } };

/** A payment holds no refund still open. */
const NO_OPEN_REFUND = { refunds: { $not: HAS_OPEN_REFUND.refunds } };

/** The stored-field query behind each label — the inverse of {@link displayStatusOf}. */
const FILTERS: Record<PaymentDisplayStatus, Record<string, unknown>> = {
    [PaymentDisplayStatus.refund_pending]: HAS_OPEN_REFUND,
    [PaymentDisplayStatus.refunded]: {
        $and: [
            { status: 'succeeded' },
            SETTLED_REFUND,
            { $expr: { $eq: ['$amountRefunded', '$amount'] } },
            NO_OPEN_REFUND
        ]
    },
    [PaymentDisplayStatus.partially_refunded]: {
        $and: [
            { status: 'succeeded' },
            SETTLED_REFUND,
            { $expr: { $ne: ['$amountRefunded', '$amount'] } },
            NO_OPEN_REFUND
        ]
    },
    [PaymentDisplayStatus.cancelled]: { $and: [{ status: 'cancelled' }, NO_OPEN_REFUND] },
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
