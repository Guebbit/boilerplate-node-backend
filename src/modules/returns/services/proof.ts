/**
 * @module
 * The buyer's proof of sending, as staff record it: the carrier's document for the parcel they sent
 * back. One-time, and it leaves the return `approved`; the goods are still to come.
 *
 * On a withdrawal the proof opens the refund then (Directive 2011/83/EU Art. 13(3): the shop may wait
 * for the goods or the proof, whichever comes first). On a defective or wrong item it only records
 * the proof, because the remedy is decided at receipt.
 *
 * See: docs/modules/returns.md#the-refund-deadline
 */

import { NO_MONEY, toMinorUnits } from '@domain-primitives/money';
import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { withTransaction } from '@infrastructure/runtime/database';
import { buyerIdOf, orderService } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { paymentService } from '@modules/payments';
import type { OpenedReturnRefund } from '@modules/payments';
import { ownOrderFlag } from '@modules/access';
import type { CallerContext } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { returnRepository } from '../repository';
import type { ReturnDocument } from '../model';
import { returnsAuditActions } from '../audit';
import { RECEIVABLE_RETURN_STATUSES, proofOpensRefund, wireLines } from '../domain';
import { notReceivable, quote } from './receive';
import { refundDueFor } from './refund-due';

/** What staff enter from the carrier's document. */
export interface ProofOfSendingInput {
    /** The date on the document: when the buyer handed the parcel over. */
    sentAt: Date;
    /** The carrier or postal provider named on it. */
    carrier: string;
    /** The document's reference, a tracking or receipt number. */
    reference: string;
}

/** The 409 for a return that already carries a proof. */
const alreadyRecorded = (): ResponseReject =>
    generateReject(409, [
        {
            code: ERROR_CODES.RETURN_PROOF_ALREADY_RECORDED,
            message: t('returns.proof-already-recorded')
        }
    ]);

/**
 * The answer for a proof a racing write beat this one to: the proof is on the return already, or
 * the goods were received in between.
 * @param id - the return
 */
const lostRace = (id: string): Promise<ResponseReject> =>
    returnRepository
        .findById(id)
        .then((now) => (now?.proofOfSendingAt === undefined ? notReceivable() : alreadyRecorded()));

/** What the transaction decided: the stamped return and the refund it opened, or a lost race. */
type Recorded = { returned: ReturnDocument; opened: OpenedReturnRefund | null } | null;

/**
 * The legal deadline to stamp on the refund the proof opens, as a spreadable fragment.
 * @param stamped - the return, with its proof
 * @param sentAt - the date on the proof
 */
const optionalDue = (
    stamped: ReturnDocument,
    sentAt: Date
): { due?: ReturnType<typeof refundDueFor> } => {
    const due = refundDueFor(stamped, { proofOfSendingAt: sentAt });
    return due ? { due } : {};
};

/**
 * The proof, the order's timeline row and, for a withdrawal, the refund record, in one transaction:
 * under the order's lock row, quote what is owed with no handling deduction, then the conditional
 * write that stamps the proof (and the amount) once.
 *
 * @param returned - the return as loaded
 * @param order - the order it came from
 * @param input - the carrier's document
 * @param context - the staff member, for the timeline and the refund
 * @returns the stamped return, or `null` when a racing write took the proof first
 */
const stampProof = (
    returned: ReturnDocument,
    order: OrderDocument,
    input: ProofOfSendingInput,
    context: CallerContext
): Promise<Recorded> =>
    withTransaction(async (session): Promise<Recorded> => {
        const orderId = String(returned.orderId);
        const id = String(returned._id);
        const opensRefund = proofOpensRefund(returned.reason);

        let quoted: { total: string; shipping: string } | undefined;
        if (opensRefund) {
            await returnRepository.lockOrder(orderId, session);
            const everyReturn = await returnRepository.findByOrderId(orderId, session);
            const others = everyReturn.filter(({ _id }) => String(_id) !== id);
            const verdict = quote(returned, order, others, '0');
            // No deduction is taken, so a quote is never refused; an unreachable refusal aborts the write.
            if (!verdict.ok)
                throw new Error('[returns] the refund quote refused a zero deduction.');
            quoted = verdict.breakdown;
        }

        const stamped = await returnRepository.claimProof(
            id,
            {
                proofOfSendingAt: input.sentAt,
                proofCarrier: input.carrier,
                proofReference: input.reference,
                ...(quoted ? { refundAmount: quoted.total, shippingRefund: quoted.shipping } : {})
            },
            session
        );
        if (!stamped) return null;

        await orderService.appendTimeline(
            orderId,
            { type: 'proof_of_sending_recorded', actor: context.caller.id, data: { returnId: id } },
            session
        );
        // Nothing owed (zero-priced lines) opens no record.
        const opened =
            quoted && toMinorUnits(quoted.total, returned.currency) > NO_MONEY
                ? await paymentService.openReturnRefund(
                      orderId,
                      {
                          returnId: id,
                          amount: quoted.total,
                          lines: wireLines(stamped.lines),
                          shipping: quoted.shipping,
                          ...optionalDue(stamped, input.sentAt)
                      },
                      context,
                      session
                  )
                : null;
        return { returned: stamped, opened };
    });

/**
 * Record a proof of sending against an approved return. On a withdrawal the refund it opens is sent
 * right after the commit, as receiving the goods would send it; a refusal is left to the payment sweep.
 *
 * @param id - the return
 * @param input - the carrier's document
 * @param context - the staff member, audited
 * @returns the return with its proof, or a refusal: 404, 409 not awaiting its goods, 409 proof already recorded
 */
export const recordProofOfSending = (
    id: string,
    input: ProofOfSendingInput,
    context: CallerContext
): Promise<ResponseSuccess<ReturnDocument> | ResponseReject> =>
    returnRepository.findById(id).then((returned) => {
        if (!returned) return generateReject(404, [t('returns.not-found')]);
        if (!RECEIVABLE_RETURN_STATUSES.includes(returned.status)) return notReceivable();
        if (returned.proofOfSendingAt !== undefined) return alreadyRecorded();

        return orderService.getById(String(returned.orderId)).then((order) => {
            if (!order) return generateReject(404, [t('returns.order-not-found')]);

            return stampProof(returned, order, input, context).then((recorded) => {
                if (!recorded) return lostRace(id);

                recordAudit(context, {
                    action: returnsAuditActions.ADMIN_RETURN_PROOF_RECORDED,
                    outcome: 'success',
                    targetType: 'return',
                    targetId: id,
                    metadata: {
                        orderId: String(recorded.returned.orderId),
                        carrier: input.carrier,
                        opensRefund: recorded.opened !== null,
                        ...ownOrderFlag(context, buyerIdOf(order))
                    }
                });
                if (!recorded.opened) return generateSuccess(recorded.returned, 200);

                return paymentService
                    .sendOpenedRefund(
                        String(recorded.returned.orderId),
                        recorded.opened.refundId,
                        context
                    )
                    .then(() => generateSuccess(recorded.returned, 200));
            });
        });
    });
