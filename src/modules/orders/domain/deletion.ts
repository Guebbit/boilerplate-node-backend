/**
 * @module
 * When an order may be deleted: the two pure questions the delete door and `OrderActions.delete` /
 * `hardDelete` both ask, so the flag and the refusal cannot disagree. An order is a financial
 * record: hiding it is for a finished (cancelled) one, destroying it only for one never paid.
 */

import { OrderStatus } from '@types';

/** The slice of an order the deletion rules read. */
export interface DeletionCandidate {
    /** Where the order is in its lifecycle. */
    status: OrderStatus;
    /** When it was paid; set once an invoice exists, absent before. */
    paidAt?: Date | null;
}

/**
 * Whether a soft delete is allowed: hidden means finished, so only a cancelled order.
 * @param order - the order as it is now
 */
export const softDeletable = (order: DeletionCandidate): boolean =>
    order.status === OrderStatus.cancelled;

/**
 * Whether a hard delete is allowed: cancelled and never paid — a paid order's invoice must survive
 * it.
 * @param order - the order as it is now
 */
export const hardDeletable = (order: DeletionCandidate): boolean =>
    !order.paidAt && order.status === OrderStatus.cancelled;
