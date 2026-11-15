/**
 * @module
 * When a refund must be done by law: the deadline of a withdrawal or return refund, and the rule
 * behind it. `tasks` reads it to date the work it opens and to say why; a refund the law sets no
 * deadline for has none here, and the opener picks its own.
 *
 * @see docs/modules/payments.md#the-story
 */

import { refundDueBy, type RefundDue } from '../domain';
import { paymentRepository } from '../repository';

/**
 * The legal deadline of a refund, as it was stamped when the record opened.
 *
 * @param paymentId - the payment carrying the refund
 * @param refundId - the refund record
 * @returns the deadline and its rule; `undefined` when the law sets none, or when the payment or
 *   the record is gone
 */
export const refundLegalDue = (
    paymentId: string,
    refundId: string
): Promise<RefundDue | undefined> =>
    paymentRepository.findById(paymentId).then((payment) => {
        const refund = payment?.refunds.find((record) => String(record._id) === refundId);
        const dueBy = refund ? refundDueBy(refund) : undefined;
        return refund?.dueRule && dueBy ? { dueBy, dueRule: refund.dueRule } : undefined;
    });
