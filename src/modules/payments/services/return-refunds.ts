/**
 * @module
 * The refund `returns` asks for: opened inside the return's own transaction (`openReturnRefund`),
 * then sent once that transaction has committed (`sendOpenedRefund`). The record, the provider
 * order and the sweep are `refunds.ts`'s; this file is only the door `returns` knocks on.
 *
 * Reads:  the payment, for who may return money and what is left of it.
 * Writes: through `refunds.ts` (`openRefund`, `openSettledOutside`), never past it.
 *
 * @see docs/modules/payments.md#its-neighbourhood
 */

import type { ClientSession } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { RefundStatus, type CallerContext, type PaidOutside, type RefundReason } from '@types';
import { enqueueOutboxEvent } from '@kernel/outbox';
import { toMinorUnits, padDecimal } from '@domain-primitives/money';
import { holds } from '@kernel/ability';
import { auditForbidden } from '@infrastructure/observability/forbidden';
import { paymentRepository } from '../repository';
import { PAYMENT_RETURN_REFUND_SHORT } from '../events';
import type { PaymentDocument, RefundLine } from '../model';
import { isHandRecorded, REFUNDABLE_PAYMENT_STATUS, type RefundDue } from '../domain';
import { announceRefund, remainingOf } from './refund-settlement';
import {
    attemptKeepingGoing,
    auditRefundRequested,
    openRefund,
    openSettledOutside,
    recordOwedByHand,
    settledElsewhere,
    type RefundRequest
} from './refunds';

/**
 * May this caller return money for a return? Three kinds of caller: the system actor; staff who
 * receive returns (`receive:Return`) or refund (`create:Refund`, the key a staff remainder cancel
 * runs under); and, for a `cancellation` only, the buyer of the order, whose withdrawal is theirs
 * to make (CRD recital 40) and which `returns` has already judged.
 *
 * @param payment - the payment the money would come off
 * @param reason - `return` or `cancellation`
 * @param context - the caller
 */
const mayReturnMoney = (
    payment: PaymentDocument,
    reason: 'return' | 'cancellation',
    context: CallerContext
): boolean =>
    context.caller.system ||
    holds(context.caller, 'receive', 'Return') ||
    holds(context.caller, 'create', 'Refund') ||
    (reason === 'cancellation' &&
        payment.userId !== undefined &&
        context.caller.id === String(payment.userId));

/**
 * Whether the caller may say a refund was paid outside the application: the same key as refunding
 * by hand (`create:Refund`), or the system itself.
 *
 * @param context - the caller
 */
const mayRefundOutside = (context: CallerContext): boolean =>
    context.caller.system || holds(context.caller, 'create', 'Refund');

/** The record a return's refund opened: its id for {@link sendOpenedRefund}, and whether it is hand-paid. */
export interface OpenedReturnRefund {
    /** The record's id, for {@link sendOpenedRefund}. */
    refundId: string;
    /** `true` when the payment was paid by hand: nothing to send, an operator pays it back. */
    byHand: boolean;
}

/**
 * Write the fact that a return asked for more than its payment could give, in the return's own
 * transaction. Returns `null` so a caller with no record to open can hand it straight back.
 *
 * @param orderId - the returned order
 * @param input - what the return asked for
 * @param opened - the decimal the record opened for, absent when none was opened
 * @param session - the return's transaction, the event row joins it
 */
const announceShort = (
    orderId: string,
    input: { returnId: string; amount: string; currency: string },
    opened: string | undefined,
    cause: 'no_payment' | 'used_up',
    session: ClientSession
): Promise<null> =>
    enqueueOutboxEvent(
        PAYMENT_RETURN_REFUND_SHORT,
        {
            returnId: input.returnId,
            orderId,
            asked: padDecimal(input.amount, input.currency),
            opened: padDecimal(opened ?? '0', input.currency),
            currency: input.currency,
            cause
        },
        orderId,
        session
    ).then(() => null);

/**
 * Record the money owed for goods a customer returned, or for a remainder canceled before it
 * shipped — `returns`' one door into the refund. It runs INSIDE the return's own transaction, so
 * the return and what it owes commit together or not at all: nothing durable is ever missing.
 *
 * The amount is clamped to what the payment still has left, so a goodwill refund made earlier
 * can never make a return over-refund. The record carries `returnId`, so `returns` can close the
 * return when the money lands. Sending it is {@link sendOpenedRefund}, after the commit.
 *
 * @param orderId - the returned order
 * @param input - which return this pays for, whether it is a `return` (the default) or a
 *   remainder `cancellation`, how much (a decimal in `currency`, the return's own), and which goods
 *   and delivery that amount covers — what the credit note credits at their own rates; and the
 *   legal deadline to stamp on the record, when the law sets one
 * @param context - the staff member who received the goods
 * @param session - the return's transaction
 * @returns the opened record, or `null` when none could be opened: a zero amount (nothing was
 *   asked), or no succeeded payment, or nothing left of it. Decided before any refund record is written.
 *   When money was asked and less than all of it was opened, `payment.return_refund_short` is
 *   written in the same transaction, so a person is told.
 * @throws Error when the caller is not one {@link mayReturnMoney} allows (audited as
 *   `security.forbidden`), or when a racing write moved the payment under this transaction: either
 *   way the transaction aborts rather than close the return with nothing owed.
 */
export const openReturnRefund = (
    orderId: string,
    input: {
        returnId: string;
        amount: string;
        currency: string;
        lines: RefundLine[];
        shipping: string;
        reason?: Extract<RefundReason, 'return' | 'cancellation'>;
        due?: RefundDue;
        paidOutside?: PaidOutside;
    },
    context: CallerContext,
    session: ClientSession
): Promise<OpenedReturnRefund | null> =>
    paymentRepository.findByOrderId(orderId, undefined, session).then((payment) => {
        if (toMinorUnits(input.amount, input.currency) <= 0) return null;
        if (payment?.status !== REFUNDABLE_PAYMENT_STATUS)
            return announceShort(orderId, input, undefined, 'no_payment', session);

        const reason = input.reason ?? 'return';
        if (!mayReturnMoney(payment, reason, context)) {
            auditForbidden(context, {
                targetType: 'payment',
                targetId: String(payment._id),
                metadata: { reason: 'missing_permission', permission: 'receive:Return' }
            });
            throw new Error(
                '[payments] openReturnRefund: the caller may not return money for a return.'
            );
        }

        if (remainingOf(payment) <= 0)
            return announceShort(orderId, input, undefined, 'used_up', session);

        // Saying the money already went back is a refund: `receive:Return` alone does not carry it.
        if (input.paidOutside && !mayRefundOutside(context)) {
            auditForbidden(context, {
                targetType: 'payment',
                targetId: String(payment._id),
                metadata: { reason: 'missing_permission', permission: 'create:Refund' }
            });
            throw new Error(
                '[payments] openReturnRefund: the caller may not record a refund as paid outside.'
            );
        }

        const request: RefundRequest = {
            amount: input.amount,
            capAtRemaining: true,
            reason,
            returnId: input.returnId,
            lines: input.lines,
            shipping: input.shipping,
            ...(input.due ? { due: input.due } : {}),
            ...(input.paidOutside ? { paidOutside: input.paidOutside } : {})
        };
        // Born settled, in this transaction: nothing is ever `pending` for the sweep to send to the card.
        const opening = input.paidOutside
            ? openSettledOutside(payment, request, context.caller.id, session)
            : openRefund(payment, request, context.caller.id, session);

        return opening.then((opened) => {
            if (!opened)
                throw new Error(
                    '[payments] openReturnRefund: the payment moved under the return; retry.'
                );
            const record = opened.refund;
            const gave = toMinorUnits(record.amount, payment.currency);
            const asked = toMinorUnits(input.amount, payment.currency);
            // Less than asked: the rest already went back another way. The record stands, a person is told.
            return (
                gave < asked
                    ? announceShort(orderId, input, record.amount, 'used_up', session)
                    : Promise.resolve(null)
            ).then(() => ({
                refundId: String(record._id),
                byHand: !input.paidOutside && isHandRecorded(payment)
            }));
        });
    });

/**
 * Where the refund {@link openReturnRefund} opened for a return stands: what `returns` asks when
 * goods arrive for a return whose refund the proof of sending opened earlier.
 *
 * @param returnId - the return the record pays for
 * @returns `'settled'` once the money went back, `'open'` while it is owed, `'none'` when no record exists
 */
export const returnRefundState = (
    orderId: string,
    returnId: string
): Promise<'none' | 'open' | 'settled'> =>
    paymentRepository.findByOrderId(orderId).then((payment) => {
        const refund = payment?.refunds.find((record) => record.returnId === returnId);
        if (!refund) return 'none';
        return refund.status === RefundStatus.succeeded ? 'settled' : 'open';
    });

/**
 * Send a refund {@link openReturnRefund} opened, now that the return has committed. A hand-paid
 * record is only put on file as owed. A card record goes to the provider; a refusal, like any
 * other error, is logged and left to the sweep, which finds the record by itself.
 *
 * @param refundId - the record to send
 * @param context - the staff member, audited on the refund
 * @returns `'settled'` when the money went back, else `'open'`
 */
export const sendOpenedRefund = (
    orderId: string,
    refundId: string,
    context: CallerContext
): Promise<'settled' | 'open'> =>
    paymentRepository
        .findByOrderId(orderId)
        .then((payment) => {
            const refund = payment?.refunds.find((record) => String(record._id) === refundId);
            if (!payment || !refund) return 'open';
            if (refund.status === RefundStatus.succeeded) {
                /**
                 * A record born settled by hand (`paidOutside`) is audited here, after the
                 * receipt's commit: the audit writer takes no session, so a row written inside the
                 * transaction would repeat on a retry and survive an abort.
                 */
                if (refund.paidOutside) announceRefund(payment, refund, context, 'success', true);
                return 'settled';
            }

            auditRefundRequested(payment, refund, context);
            if (isHandRecorded(payment)) {
                recordOwedByHand(payment, refund, context);
                return 'open';
            }
            return attemptKeepingGoing(payment, refund, context)
                .then((after) => after ?? settledElsewhere(orderId, refund))
                .then((settled) => (settled ? 'settled' : 'open'));
        })
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: the refund ${refundId} for order ${orderId} is recorded but not settled; the payment sweep retries it`,
                error
            });
            // Stryker restore all
            return 'open';
        });
