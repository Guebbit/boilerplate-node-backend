/**
 * @module
 * When a refund must be done: the legal deadline of a withdrawal or return refund, else the time a
 * person is given before it is "needs attention". `tasks` reads it to date the work it opens.
 *
 * See: docs/modules/payments.md
 */

import { paymentAttentionMinutes } from '../config';
import { refundDueBy } from '../domain';
import { paymentRepository } from '../repository';

/**
 * The instant a refund is due.
 *
 * @param paymentId - the payment carrying the refund
 * @param refundId - the refund record
 * @returns the legal deadline when the law sets one (`refundDueBy`), else the record's creation
 *   plus the attention threshold; `undefined` when the payment or the record is gone
 */
export const refundDueAt = (paymentId: string, refundId: string): Promise<Date | undefined> =>
    paymentRepository.findById(paymentId).then((payment) => {
        const refund = payment?.refunds.find((record) => String(record._id) === refundId);
        if (!refund) return undefined;
        return (
            refundDueBy(refund) ??
            new Date(refund.createdAt.getTime() + paymentAttentionMinutes() * 60_000)
        );
    });
