/**
 * @module
 * When an order may be deleted: the two pure questions the delete door and `OrderActions.delete` /
 * `hardDelete` both ask, so the flag and the refusal cannot disagree. An order is a financial
 * record: hiding it is for a finished (cancelled) one, destroying it only for one never paid and
 * never handed money.
 */

import { OrderStatus } from '@types';

/** The slice of an order the deletion rules read. */
export interface DeletionCandidate {
    /** Where the order is in its lifecycle. */
    status: OrderStatus;
    /** When it was paid; set once an invoice exists, absent before. */
    paidAt?: Date | null;
    /** When money was recorded on it after it could no longer take it; absent otherwise. */
    moneyReceivedAt?: Date | null;
}

/**
 * Whether a soft delete is allowed: hidden means finished, so only a cancelled order.
 * @param order - the order as it is now
 */
export const softDeletable = (order: DeletionCandidate): boolean =>
    order.status === OrderStatus.cancelled;

/**
 * Whether a hard delete is allowed: cancelled, never paid and never handed money — a paid order's
 * invoice must survive it, and so must the order a late payment and its refund point at.
 * @param order - the order as it is now
 */
export const hardDeletable = (order: DeletionCandidate): boolean =>
    !order.paidAt && !order.moneyReceivedAt && order.status === OrderStatus.cancelled;
