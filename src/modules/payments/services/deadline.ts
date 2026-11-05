/**
 * @module
 * When a refund must be done by law: the deadline of a withdrawal or return refund. `tasks` reads
 * it to date the work it opens; a refund the law sets no deadline for has none here, and the opener
 * picks its own.
 *
 * See: docs/modules/payments.md
 */

import { refundDueBy } from '../domain';
import { paymentRepository } from '../repository';

/**
 * The instant the law says a refund is due.
 *
 * @param paymentId - the payment carrying the refund
 * @param refundId - the refund record
 * @returns the legal deadline (`refundDueBy`); `undefined` when the law sets none, or when the
 *   payment or the record is gone
 */
export const refundLegalDueAt = (paymentId: string, refundId: string): Promise<Date | undefined> =>
    paymentRepository.findById(paymentId).then((payment) => {
        const refund = payment?.refunds.find((record) => String(record._id) === refundId);
        return refund ? refundDueBy(refund) : undefined;
    });
