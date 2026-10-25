/**
 * @module
 * Giving money back — the operator action (`refundPayment`) and the `order.cancelled` listener's
 * compensation (`refundForOrder`), both through `performRefund`. Nothing else in this module may
 * move money out.
 *
 * Record:   a refund is a row on the payment, opened BEFORE the provider is asked. Opening is one
 *           conditional write that also raises `amountRefunded`, so two racing refunds cannot
 *           return more than was paid.
 * Order:    the provider is asked next, and the record settles only once it confirms. A refusal
 *           leaves the record `failed` — open, retried by the sweep with the SAME idempotency key
 *           — instead of recording money as returned before anyone asked.
 * Full:     the payment stays `succeeded` however much goes back; `displayStatus` reads
 *           `refunded` once the records add up to `amount`. What keeps a refunded payment from
 *           refunding twice is `addRefund`'s condition on `amountRefunded`.
 * Provider: dispatched on the PAYMENT's own `provider`, never the deployment's configured one — a
 *           `manual` payment has no provider to ask, and a real PSP refund must go back to
 *           whichever provider actually took the money, even if the deployment has since switched.
 */

import { Types, type ClientSession } from 'mongoose';
import { extractErrorMessage } from '@guebbit/js-toolkit';
import { logger } from '@infrastructure/adapters/logger';
import { t } from '@infrastructure/i18n';
import {
    fieldError,
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { AuthContext } from '@types';
import { RefundFailureReason, RefundStatus, type CallerContext, type RefundReason } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import type { DomainEventMap } from '@kernel/events';
import { announceInTransaction } from '@kernel/outbox';
import { withTransaction } from '@infrastructure/runtime/database';
import { systemCallerContext } from '@kernel/permissions';
import {
    fitsCurrency,
    toMinorUnits,
    toDecimalAmount,
    addMoney,
    minMoney,
    subtractMoney,
    type Money
} from '@domain-primitives/money';
import { orderService } from '@modules/orders';
import { holds } from '@kernel/ability';
import { auditForbidden } from '@infrastructure/observability/forbidden';
import { ownOrderFlag } from '@modules/access';
import { paymentsAuditActions } from '../audit';
import { PaymentProviderError, providerNamed } from '../providers';
import { paymentRepository } from '../repository';
import { PAYMENT_REFUNDED } from '../events';
import type { PaymentDocument, RefundLine, RefundRecord, RefundSettlement } from '../model';
import { isHandRecorded, OPEN_REFUND_STATUSES, REFUNDABLE_PAYMENT_STATUS } from '../domain';
import { callerScope } from './scope';
import { ERROR_CODES } from '@api/error-codes';
import { paymentNotFound, RefundLeftOpenError } from './errors';

/** What one refund is asked to do. */
export interface RefundRequest {
    /** A decimal in the payment's currency; absent means everything still refundable. */
    amount?: number;
    /** Why the money goes back — recorded on the refund. */
    reason: RefundReason;
    /**
     * The return this pays for, when `reason` is `return` — recorded so it can be closed later — or
     * the cancellation of a fulfillment order's remainder, when `reason` is `cancellation`.
     */
    returnId?: string;
    /** The goods this pays back, when it pays for specific ones — see `RefundRecord.lines`. */
    lines?: RefundLine[];
    /** The delivery cost inside the amount, beside `lines` — a decimal. */
    shipping?: number;
    /**
     * Take at most what is left instead of refusing when the figure no longer fits. A return's
     * amount is clamped on a read that a racing refund can outdate; the re-read after a missed
     * write then refunds the rest, not nothing.
     */
    capAtRemaining?: boolean;
}

/** The request the automatic callers make: everything left, for a cancellation. */
export const CANCELLATION_REQUEST: RefundRequest = Object.freeze({ reason: 'cancellation' });

/**
 * The request for money that arrived after the order could no longer be paid: everything, named
 * for what happened so staff can tell a lost sale from a cancellation.
 */
export const LATE_PAYMENT_REQUEST: RefundRequest = Object.freeze({ reason: 'late_payment' });

/** A refund that was just opened, with the payment as it stood right after. */
export interface OpenedRefund {
    payment: PaymentDocument;
    refund: RefundRecord;
}

/** What a refund attempt ended in. */
export interface RefundOutcome {
    /** The payment as it now stands. */
    payment: PaymentDocument;
    /** `true` when the record was opened but not settled: hand-paid money waits for an operator. */
    leftOpen: boolean;
}

/** How much of a provider's own wording one log line carries. */
const MAX_ERROR_LENGTH = 500;

/**
 * The closed reason a refund failed, for the record. An adapter that classified its error threw a
 * {@link PaymentProviderError}; anything else is `unknown`. The wording itself is logged here and
 * never stored: it is the provider's, and can carry anything.
 *
 * @param error - what the provider call rejected with
 * @param refund - the record that failed, for the log line
 */
const failureReasonOf = (error: unknown, refund: RefundRecord): RefundFailureReason => {
    logger.warn({
        message: 'The provider refused a refund.',
        refundId: String(refund._id),
        error: extractErrorMessage(error, String(error)).slice(0, MAX_ERROR_LENGTH)
    });
    return error instanceof PaymentProviderError ? error.code : RefundFailureReason.unknown;
};

/**
 * What is still refundable on a payment, in minor units: what was paid minus what has been asked
 * back (pending counts — see `PaymentDocument.amountRefunded`).
 * @param payment - the payment
 */
export const remainingOf = (payment: PaymentDocument): Money =>
    subtractMoney(
        toMinorUnits(payment.amount, payment.currency),
        toMinorUnits(payment.amountRefunded, payment.currency)
    );

/**
 * Put a hand-paid refund on file as owed: an audit row naming the order, the record and the money,
 * so a person sees there is cash or a transfer to hand back outside the app. The row is the only
 * place that says so besides `GET /payments/attention`.
 *
 * Idempotent by construction: it is called once per record, right after the record opens, and a
 * redelivery opens no second record.
 *
 * @param payment - the hand-recorded payment
 * @param refund - the record that just opened
 * @param context - the caller who caused it, when there is one; absent, the system is the actor
 */
export const recordOwedByHand = (
    payment: PaymentDocument,
    refund: RefundRecord,
    context?: CallerContext
): void =>
    recordAudit(context ?? systemCallerContext('Payment'), {
        action: paymentsAuditActions.PAYMENT_REFUND_OWED_BY_HAND,
        outcome: 'success',
        targetType: 'order',
        targetId: String(payment.orderId),
        metadata: {
            refundId: String(refund._id),
            amount: refund.amount,
            reason: refund.reason
        }
    });

/**
 * Open a hand-paid payment's refund and leave it `pending`. There is no provider to ask and
 * nobody here to say the money went back, so the record waits for an operator's own
 * `settleRefundByHand`: it is what the needs-attention list shows. No caller, however privileged,
 * settles it on the spot — receiving a parcel or withdrawing a basket is not returning cash.
 *
 * Idempotent: the record reserves the amount, so a redelivery finds nothing left to open and
 * writes nothing.
 *
 * @param payment - the payment, still `succeeded`
 * @param request - what to return; a cancellation takes everything still left
 * @param context - the caller, absent for the `order.cancelled` listener
 * @returns the payment with the record open, or `null` when nothing was left to open
 */
const leaveForOperator = (
    payment: PaymentDocument,
    request: RefundRequest,
    context: CallerContext | undefined
): Promise<RefundOutcome | null> =>
    openRefund(payment, request, context?.caller.id).then((opened) => {
        if (!opened) return null;
        // Stryker disable all
        logger.warn(
            `Payment for order ${String(payment.orderId)} was paid by hand — the refund is left \`pending\` for an operator to confirm the money actually went back.`
        );
        // Stryker restore all
        auditRefundRequested(opened.payment, opened.refund, context);
        recordOwedByHand(opened.payment, opened.refund, context);
        return { payment: opened.payment, leftOpen: true };
    });

/**
 * What a refund's timeline rows carry: its id, the money and the closed reason code. Never the
 * provider's wording.
 *
 * @param refund - the refund record
 */
const refundRow = (
    refund: Pick<RefundRecord, '_id' | 'amount' | 'currency' | 'reason'>
): Record<string, string | number> => ({
    refundId: String(refund._id),
    amount: refund.amount,
    currency: refund.currency,
    reason: refund.reason
});

/**
 * Open a refund on a payment: reserve the amount and append its record in one conditional write.
 *
 * A miss means another write moved `amountRefunded` between the caller's read and this one — so the
 * payment is re-read and the whole check runs again against what is really left, instead of
 * refunding from a stale figure. Each miss means someone else made progress, so it ends.
 *
 * The order's timeline row commits with the record, in one transaction: a refund exists exactly
 * when its `refund_issued` does.
 *
 * @param payment - the payment as the caller read it
 * @param request - the amount (absent = everything left) and the reason
 * @param actor - the operator who asked, when one did; absent for the automatic listener
 * @param session - the caller's transaction, when the record belongs to one (a settlement that
 *   found its order gone); absent, the record opens in a transaction of its own
 * @returns the opened record and the payment after it, or `null` when nothing (or not that much)
 *   is left to refund
 */
export const openRefund = (
    payment: PaymentDocument,
    request: RefundRequest,
    actor?: string | null,
    session?: ClientSession
): Promise<OpenedRefund | null> => {
    const { currency, _id: paymentId, orderId, amountRefunded } = payment;
    const remaining = remainingOf(payment);
    const wanted =
        request.amount === undefined ? remaining : toMinorUnits(request.amount, currency);
    const amount = request.capAtRemaining ? minMoney(wanted, remaining) : wanted;
    if (amount <= 0 || amount > remaining) return Promise.resolve(null);

    const refundId = new Types.ObjectId();
    const refund = {
        _id: refundId,
        amount: toDecimalAmount(amount, currency),
        currency,
        status: 'pending' as const,
        reason: request.reason,
        ...(request.returnId ? { returnId: request.returnId } : {}),
        ...(request.lines ? { lines: request.lines, shipping: request.shipping ?? 0 } : {}),
        // One key per RECORD, not per payment: two different partial refunds must not be taken
        // for one by the provider, while a retry of this one must be.
        idempotencyKey: `refund:${String(paymentId)}:${String(refundId)}`
    };
    const newTotal = addMoney(toMinorUnits(amountRefunded, currency), amount);

    const write = (active: ClientSession): Promise<PaymentDocument | null> =>
        paymentRepository
            .addRefund(
                String(paymentId),
                amountRefunded,
                toDecimalAmount(newTotal, currency),
                refund,
                active
            )
            .then((updated) =>
                updated
                    ? orderService
                          .appendTimeline(
                              String(orderId),
                              {
                                  type: 'refund_issued',
                                  actor,
                                  data: refundRow(refund)
                              },
                              active
                          )
                          .then(() => updated)
                    : updated
            );

    return (session ? write(session) : withTransaction(write)).then((updated) => {
        // `createdAt` is stamped by mongoose on insert; the record this write appended is
        // otherwise exactly `refund` — one cast for the one field the compiler cannot see.
        if (updated) return { payment: updated, refund: refund as RefundRecord };
        // Inside a caller's transaction the payment is the one that caller just wrote: a miss is
        // final, and a re-read outside the transaction would see something older.
        if (session) return null;
        return paymentRepository
            .findByOrderId(String(orderId))
            .then((fresh) =>
                fresh?.status === REFUNDABLE_PAYMENT_STATUS
                    ? openRefund(fresh, request, actor)
                    : null
            );
    });
};

/**
 * Whether every unit of a payment has gone back: the records add up to `amount`, and none is
 * still open.
 * @param payment - the payment, after a refund just settled
 */
const isFullyRefunded = (payment: PaymentDocument): boolean =>
    remainingOf(payment) === 0 && payment.refunds.every((refund) => refund.status === 'succeeded');

/**
 * Tell the rest of the system a refund landed: the log line and the audit row.
 * The `payment.refunded` fact itself is not here: it is written with the settlement
 * ({@link settleRefund}), so it exists exactly when the refund settled.
 *
 * @param payment - the payment after the refund settled
 * @param refund - the record that settled
 * @param context - present only for the admin request; audited only then
 * @param outcome - `failure` when the status moved but no money actually went back
 * @param byHand - the operator confirmed hand-paid money returned (`settleRefundByHand`)
 */
const announceRefund = (
    payment: PaymentDocument,
    refund: RefundRecord,
    context: CallerContext | undefined,
    outcome: 'success' | 'failure',
    byHand: boolean
): void => {
    const orderId = String(payment.orderId);
    // Stryker disable all
    logger.info(
        outcome === 'success'
            ? `Payment for order ${orderId} refunded (${refund.amount} of ${payment.amount} ${payment.currency})`
            : `Payment for order ${orderId} marked refunded with no money actually returned — see the error logged just before this`
    );
    // Stryker restore all
    recordAudit(context, {
        action: byHand
            ? paymentsAuditActions.ADMIN_PAYMENT_REFUND_SETTLED_BY_HAND
            : paymentsAuditActions.ADMIN_PAYMENT_REFUNDED,
        outcome,
        targetType: 'order',
        targetId: orderId,
        metadata: {
            refundId: String(refund._id),
            amount: refund.amount,
            ...ownOrderFlag(context, payment.userId?.toString())
        }
    });
};

/**
 * Put the decision on file when a refund's record opens: who asked, for how much and why, with
 * `ownOrder` when the asker is the buyer. Written before the provider is asked, because a refusal
 * leaves the record to the sweep, which has no caller and audits nothing — without this row the
 * only evidence that a caller asked would be the settlement row, which never comes.
 *
 * @param payment - the payment the refund is taken from
 * @param refund - the record that just opened
 * @param context - the caller; the `order.cancelled` listener has none and writes no row
 */
const auditRefundRequested = (
    payment: PaymentDocument,
    refund: RefundRecord,
    context: CallerContext | undefined
): void =>
    recordAudit(context, {
        action: paymentsAuditActions.ADMIN_PAYMENT_REFUND_REQUESTED,
        outcome: 'success',
        targetType: 'order',
        targetId: String(payment.orderId),
        metadata: {
            refundId: String(refund._id),
            amount: refund.amount,
            reason: refund.reason,
            ...ownOrderFlag(context, payment.userId?.toString())
        }
    });

/**
 * The `payment.refunded` payload for one settled refund — the fact `invoicing` issues a credit note
 * from and `webhooks` fans out. Built even for the corrupted-row case (`outcome: 'failure'`):
 * `invoicing` cannot see that distinction, and a credit note is owed either way.
 *
 * @param payment - the payment after the refund settled
 * @param refund - the record that settled
 */
const refundedPayload = (
    payment: PaymentDocument,
    refund: RefundRecord
): DomainEventMap['payment.refunded'] => ({
    paymentId: String(payment._id),
    orderId: String(payment.orderId),
    refundId: String(refund._id),
    ...(refund.returnId ? { returnId: refund.returnId } : {}),
    ...(refund.lines?.length
        ? {
              goods: {
                  lines: refund.lines.map(({ productId, quantity }) => ({ productId, quantity })),
                  shipping: refund.shipping ?? 0
              }
          }
        : {}),
    amount: refund.amount,
    currency: refund.currency,
    full:
        toMinorUnits(refund.amount, refund.currency) ===
        toMinorUnits(payment.amount, payment.currency)
});

/**
 * Tell `orders` where the money stands now, so its `paymentStatus` reads right without `orders`
 * ever asking here. Part of the settlement's transaction, not a report after it: nothing later
 * repairs a missed stamp after the last refund, so it commits with the settlement or not at all.
 *
 * @param payment - the payment after the refund settled
 * @param session - the settlement's transaction
 */
const stampOrder = (payment: PaymentDocument, session: ClientSession): Promise<boolean> =>
    orderService.markPaymentStatus(
        String(payment.orderId),
        isFullyRefunded(payment) ? 'refunded' : 'partially_refunded',
        session
    );

/**
 * The settlement's writes, inside the caller's transaction: the refund record goes `succeeded`,
 * and the order's payment status is stamped to match (`refunded` when that was the last of it).
 *
 * @param payment - the payment the refund belongs to
 * @param refund - the record being settled
 * @param fields - see {@link settleRefund}
 * @param session - the transaction both writes join
 * @param actor - the operator who settled it by hand, when one did
 * @returns the payment as it now stands, or `null` when the record was no longer open
 */
const writeSettlement = (
    payment: PaymentDocument,
    refund: RefundRecord,
    fields: RefundSettlement,
    session: ClientSession,
    actor?: string | null
): Promise<PaymentDocument | null> =>
    paymentRepository
        .settleRefund(String(payment._id), String(refund._id), fields, session)
        .then((final) =>
            final
                ? stampOrder(final, session)
                      .then(() =>
                          orderService.appendTimeline(
                              String(final.orderId),
                              { type: 'refund_settled', actor, data: refundRow(refund) },
                              session
                          )
                      )
                      .then(() => final)
                : null
        );

/**
 * Settle one open refund. The
 * conditional write IS the idempotence: a second caller (the sweep racing the request) finds the
 * record already `succeeded` and answers `null`, so the announcement fires once. The
 * `payment.refunded` outbox row commits with the writes, never after them.
 *
 * @param payment - the payment the refund belongs to
 * @param refund - the record being settled
 * @param fields - the provider's refund id, or `refundedByHand` for an operator's own report
 * @param context - present only for the admin request
 * @param outcome - `failure` for the corrupted-row case
 * @returns the payment as it now stands, or `null` when another caller settled it first
 */
const settleRefund = (
    payment: PaymentDocument,
    refund: RefundRecord,
    fields: RefundSettlement,
    context: CallerContext | undefined,
    outcome: 'success' | 'failure' = 'success'
): Promise<PaymentDocument | null> =>
    announceInTransaction(
        (session) => writeSettlement(payment, refund, fields, session, context?.caller.id),
        (final) => ({
            name: PAYMENT_REFUNDED,
            payload: refundedPayload(final, refund),
            aggregateId: String(final.orderId)
        })
    ).then((final) => {
        if (final) announceRefund(final, refund, context, outcome, fields.refundedByHand === true);
        return final;
    });

/**
 * Whether a refusal is worth a timeline row: the first one, or one for a different reason than the
 * last. The sweep retries a stuck refund every few minutes, and a row each time would bury the rest.
 *
 * @param refund - the record as it was read before this refusal
 * @param failureReason - the closed code for what the provider said now
 */
const isNewFailure = (refund: RefundRecord, failureReason: RefundFailureReason): boolean =>
    (refund.attempts ?? 0) === 0 || refund.failureReason !== failureReason;

/**
 * Record that the provider refused a refund: the record goes `failed` (counting the attempt) and,
 * when the refusal is news ({@link isNewFailure}), the order's timeline says so, in one
 * transaction. Only an open record can fail, so a late error never walks back a refund that
 * already succeeded, and writes no row.
 *
 * @param payment - the payment
 * @param refund - the record the provider refused, as it was read
 * @param failureReason - the closed code for what it said
 */
const recordRefundFailure = (
    payment: PaymentDocument,
    refund: RefundRecord,
    failureReason: RefundFailureReason
): Promise<void> =>
    withTransaction((session) =>
        paymentRepository
            .failRefund(String(payment._id), String(refund._id), failureReason, session)
            .then((failed) =>
                failed && isNewFailure(refund, failureReason)
                    ? orderService.appendTimeline(
                          String(payment.orderId),
                          {
                              type: 'refund_failed',
                              data: { ...refundRow(refund), failureReason }
                          },
                          session
                      )
                    : undefined
            )
    );

/**
 * Ask the provider to return one refund's money, and record its answer. A refusal marks the record
 * `failed` and throws {@link RefundLeftOpenError}; the record stays open for the refund sweep, and
 * the caller (the `order.cancelled` listener) logs it instead of rethrowing.
 *
 * @param payment - the payment (never `manual`, never without a `providerRef`)
 * @param refund - the record to send
 * @param providerRef - the provider's own id for the payment
 * @param context - present only for the admin request
 */
const sendToProvider = (
    payment: PaymentDocument,
    refund: RefundRecord,
    providerRef: string,
    context: CallerContext | undefined
): Promise<PaymentDocument | null> =>
    providerNamed(payment.provider)
        .refund(
            providerRef,
            { amount: refund.amount, currency: refund.currency },
            { idempotencyKey: refund.idempotencyKey }
        )
        .then(
            ({ refundRef }) =>
                settleRefund(payment, refund, { providerRefundRef: refundRef }, context),
            (error: unknown) =>
                recordRefundFailure(payment, refund, failureReasonOf(error, refund)).then(() => {
                    throw new RefundLeftOpenError(error);
                })
        );

/**
 * Carry one open refund to its end: log the impossible row, or ask the provider. A hand-paid
 * refund is never carried here: only `settleRefundByHand` may say the cash went back.
 *
 * @param payment - the payment the refund belongs to
 * @param refund - the record to carry through
 * @param context - present only for the admin request
 * @returns the payment after the refund settled, or `null` when it did not settle here
 */
const attemptRefund = (
    payment: PaymentDocument,
    refund: RefundRecord,
    context: CallerContext | undefined
): Promise<PaymentDocument | null> => {
    // Money recorded by hand has no provider to ask, and nothing here may declare it returned.
    if (isHandRecorded(payment)) return Promise.resolve(null);

    if (!payment.providerRef) {
        // Only a `succeeded` payment reaches here, and nothing can succeed before the provider
        // has been asked for an intent — so this is a corrupted row, not a reachable state. Loud,
        // and the record still settles: leaving it open would invite a second attempt at the same
        // impossible refund.
        // Stryker disable all
        logger.error({
            message: 'Refunded a payment carrying no provider reference — money was NOT returned.',
            orderId: String(payment.orderId)
        });
        // Stryker restore all
        return settleRefund(payment, refund, {}, context, 'failure');
    }

    return sendToProvider(payment, refund, payment.providerRef, context);
};

/**
 * Carry one record through, treating the provider's refusal as that record's own business: it is
 * already `failed` and open for the sweep, so it must not stop the records behind it.
 *
 * @param payment - the payment as the previous record left it
 * @param refund - the record to carry through
 * @param context - present only for the admin request
 * @returns the payment after the refund settled, or `null` when it did not settle here
 */
const attemptKeepingGoing = (
    payment: PaymentDocument,
    refund: RefundRecord,
    context: CallerContext | undefined
): Promise<PaymentDocument | null> =>
    attemptRefund(payment, refund, context).catch((error: unknown) => {
        if (error instanceof RefundLeftOpenError) return null;
        throw error;
    });

/**
 * Finish the refunds a payment still has open — the same records, the same idempotency keys, so a
 * provider that already returned the money answers with the refund it already made.
 *
 * A record the provider refuses stays open and the next one is still tried; any other error (the
 * database, say) stops the walk, as nothing after it can be trusted to land either.
 *
 * @param payment - the payment
 * @param context - present only for the admin request
 * @param statuses - which records to send: the sweep sends every open one; a request sends only
 *   those never attempted (`pending`), as a `failed` one is the sweep's to retry
 * @returns the payment after the last one, and whether any settled here
 */
export const settleOpenRefunds = async (
    payment: PaymentDocument,
    context?: CallerContext,
    statuses: readonly RefundStatus[] = OPEN_REFUND_STATUSES
): Promise<{ payment: PaymentDocument; settled: boolean }> => {
    let current = payment;
    let settled = false;

    for (const refund of payment.refunds) {
        if (!statuses.includes(refund.status)) continue;
        const after = await attemptKeepingGoing(current, refund, context);
        if (!after) continue;
        current = after;
        settled = true;
    }

    return { payment: current, settled };
};

/**
 * A refund this caller opened, whose settlement another caller won (the sweep, or a racing request
 * that finished the open records first): the money did go back, so the opener reports that instead
 * of "nothing to return". A record still open, or an operator-owed hand-paid one, is not that.
 *
 * @param orderId - the order whose payment carries the record
 * @param refund - the record this caller opened
 * @returns the payment as it now stands, or `null` when the record is not settled
 */
const settledElsewhere = (orderId: string, refund: RefundRecord): Promise<PaymentDocument | null> =>
    paymentRepository
        .findByOrderId(orderId)
        .then((fresh) =>
            fresh?.refunds.some(
                (record) =>
                    String(record._id) === String(refund._id) && record.status === 'succeeded'
            )
                ? fresh
                : null
        );

/**
 * The card half of {@link performRefund}: send what was never attempted, then open and send the
 * rest. A `failed` record is left alone: it is the sweep's, and re-sending it here would throw
 * before the new record exists.
 *
 * @param orderId - the order whose payment is being returned
 * @param payment - the `succeeded`, not-yet-fully-refunded provider payment
 * @param context - present only for the admin request
 * @param request - the amount and the reason
 * @returns the payment after the refund settled, or `null` when nothing settled here
 */
const performCardRefund = (
    orderId: string,
    payment: PaymentDocument,
    context: CallerContext | undefined,
    request: RefundRequest
): Promise<PaymentDocument | null> =>
    settleOpenRefunds(payment, context, [RefundStatus.pending]).then(
        ({ payment: current, settled }) => {
            if (remainingOf(current) <= 0) return settled ? current : null;

            return openRefund(current, request, context?.caller.id).then((opened) => {
                if (!opened) return null;
                auditRefundRequested(opened.payment, opened.refund, context);
                return attemptRefund(opened.payment, opened.refund, context).then(
                    (after) => after ?? settledElsewhere(orderId, opened.refund)
                );
            });
        }
    );

/**
 * Refund an order's payment — the operator action, and the listener's compensation.
 *
 * A card payment finishes any refund still open first, so a retried cancel completes the refund it
 * already started instead of opening a second one for the same money. A hand-paid payment only
 * ever gets a record opened and left `pending` ({@link leaveForOperator}), whoever asked.
 *
 * @param orderId - the order whose payment is being returned
 * @param context - present only for a request with a caller (`refundPayment`, `refundForReturn`);
 *  the `order.cancelled` listener (`refundForOrder`) has none
 * @param request - the amount and the reason; omitted, it is everything left, for a cancellation
 * @returns the payment as it now stands — always still `succeeded`, whatever was returned (its
 *   `displayStatus` says how much) — and whether the record was left open for an operator; or
 *   `null` when there was nothing to return
 * @internal The step beneath `refundPayment`, `refundForOrder` and `refundForReturn`, which carry
 *   the scope and permission checks; it never leaves the barrel.
 */
export const performRefund = (
    orderId: string,
    context?: CallerContext,
    request: RefundRequest = CANCELLATION_REQUEST
): Promise<RefundOutcome | null> =>
    paymentRepository.findByOrderId(orderId).then((payment) => {
        if (payment?.status !== REFUNDABLE_PAYMENT_STATUS) return null;
        // Everything is back already: a repeated cancel has nothing to leave for anyone.
        if (isFullyRefunded(payment)) return null;

        if (isHandRecorded(payment)) return leaveForOperator(payment, request, context);

        return performCardRefund(orderId, payment, context, request).then((settled) =>
            settled ? { payment: settled, leftOpen: false } : null
        );
    });

/**
 * The 422 an operator's amount earns, if any — checked against the payment BEFORE anything is
 * written, so a wrong number never opens a record.
 *
 * @param payment - the payment the refund is for
 * @param body - the request's `amount` and `currency`
 * @returns the refusal, or `undefined` when the request is fine
 */
const refusalFor = (
    payment: PaymentDocument,
    body: { amount?: number; currency?: string }
): ResponseReject | undefined => {
    const { amount, currency } = body;
    if (currency !== undefined && currency !== payment.currency)
        return generateReject(422, [
            fieldError('currency', t('payments.refund-currency-mismatch'))
        ]);
    if (amount === undefined) return undefined;

    // A decimal the currency has no minor unit for (0.001 EUR) would round to a different amount
    // than the one the operator typed — refused rather than quietly changed.
    if (!fitsCurrency(amount, payment.currency))
        return generateReject(422, [fieldError('amount', t('payments.refund-invalid-amount'))]);
    const minor = toMinorUnits(amount, payment.currency);
    if (payment.status === REFUNDABLE_PAYMENT_STATUS && minor > remainingOf(payment))
        return generateReject(422, [
            fieldError(
                'amount',
                t('payments.refund-exceeds-remaining'),
                ERROR_CODES.PAYMENT_REFUND_EXCEEDS_REMAINING
            )
        ]);
    return undefined;
};

/** The 409 for a payment with nothing left to return. */
const notRefundable = (): ResponseReject =>
    generateReject(409, [
        { code: ERROR_CODES.PAYMENT_NOT_REFUNDABLE, message: t('payments.not-refundable') }
    ]);

/**
 * The operator's refund of a payment that exists: refuse a body that cannot stand, otherwise
 * refund and answer with the payment as it now stands. On a hand-paid payment that is the record
 * left `pending`: `settleRefundByHand` is what says the money went back.
 * @param payment - the payment, read through the caller's scope
 * @param body - the amount to return, or none for what is left
 * @param context - the operator, audited on the refund
 */
const refundFoundPayment = (
    payment: PaymentDocument,
    body: { amount?: number },
    context: CallerContext
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> => {
    const invalid = refusalFor(payment, body);
    if (invalid) return Promise.resolve(invalid);
    // The `PaymentActions.refund` rule. A card refund still open (pending or failed) stays with the
    // refund sweep: asking again would re-send it past the sweep's grace window.
    if (payment.status !== REFUNDABLE_PAYMENT_STATUS || remainingOf(payment) <= 0)
        return Promise.resolve(notRefundable());

    return performRefund(String(payment.orderId), context, {
        amount: body.amount,
        reason: 'goodwill'
    }).then((refunded) => (refunded ? generateSuccess(refunded.payment, 200) : notRefundable()));
};

/**
 * `POST /payments/:id/refunds` — the operator returning money on its own, separate from
 * cancelling. Admin-only at the route.
 *
 * @param paymentId - the payment whose money is being returned
 * @param authContext - the caller, for the read that distinguishes 404 from 409
 * @param context - the caller context to audit the refund against
 * @param body - the optional `amount` (absent = everything left) and its `currency`
 * @returns the payment as it now stands, or a refusal naming which case it was
 */
export const refundPayment = (
    paymentId: string,
    authContext: AuthContext | undefined,
    context: CallerContext,
    body: { amount?: number; currency?: string } = {}
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
    paymentRepository
        .findByIdScoped(paymentId, callerScope(authContext))
        .then((payment) =>
            payment ? refundFoundPayment(payment, body, context) : paymentNotFound()
        );

/**
 * The refusal `settleRefundByHand` earns before anything is written, if any.
 *
 * @param payment - the payment the refund sits on
 * @param refund - the record the operator names
 */
const handSettlementRefusal = (
    payment: PaymentDocument,
    refund: RefundRecord
): ResponseReject | undefined => {
    // A card refund belongs to the provider and the sweep, never to an operator's say-so.
    if (!isHandRecorded(payment))
        return generateReject(409, [
            {
                code: ERROR_CODES.PAYMENT_REFUND_NOT_BY_HAND,
                message: t('payments.refund-not-by-hand')
            }
        ]);
    if (refund.status === RefundStatus.pending) return undefined;
    return handRefundNotOpen();
};

/** The 409 for a hand-paid refund someone else already settled. */
const handRefundNotOpen = (): ResponseReject =>
    generateReject(409, [
        { code: ERROR_CODES.PAYMENT_REFUND_NOT_OPEN, message: t('payments.refund-not-open') }
    ]);

/**
 * `POST /payments/:id/refunds/:refundId/settle` — the operator confirming that hand-paid money
 * (cash or a transfer) was returned outside the app. The only door that settles a hand-paid
 * refund: nothing else says the money went back.
 *
 * The settlement is the same one a provider refund gets (the `payment.refunded` event, hence the
 * credit note, and the close of a return that waits on it), with `refundedByHand` on the record.
 *
 * @param paymentId - the payment carrying the refund
 * @param refundId - the refund record to settle
 * @param authContext - the caller, for the read that distinguishes 404 from 409
 * @param context - the operator, audited on the settlement
 * @returns the payment as it now stands, or a refusal naming which case it was
 */
export const settleRefundByHand = (
    paymentId: string,
    refundId: string,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
    paymentRepository.findByIdScoped(paymentId, callerScope(authContext)).then((payment) => {
        if (!payment) return paymentNotFound();
        const refund = payment.refunds.find((record) => String(record._id) === refundId);
        // The same 404 as an unknown payment: a refund id is read only through its payment.
        if (!refund) return paymentNotFound();

        const refusal = handSettlementRefusal(payment, refund);
        if (refusal) return refusal;

        // `null` is the loser of a two-staff race: the conditional write found it settled already.
        return settleRefund(payment, refund, { refundedByHand: true }, context).then((final) =>
            final ? generateSuccess(final, 200) : handRefundNotOpen()
        );
    });

/**
 * The `order.cancelled` listener's refund: give the money back if any was taken. The event is the
 * only promise of it, delivered by the outbox until this resolves.
 *
 * Idempotent: a redelivery, or a cancel of a never-paid order, finds nothing left to return and
 * does nothing. Once a refund record is open, that record is the durable promise —
 * {@link retryOpenRefunds} finishes it, forever and with the same idempotency key — so a provider
 * refusal ({@link RefundLeftOpenError}) is logged and not rethrown. A throw BEFORE the record exists (the database is down)
 * still rejects, and the outbox delivers the event again.
 *
 * A hand-paid order opens its record and waits for an operator (`leaveForOperator`).
 *
 * @param orderId - the order that was cancelled
 * @internal The `order.cancelled` listener's refund, which has no caller of its own to check: only
 *   this module's `subscribe` may run it, so it is not on `paymentService`.
 */
export const refundForOrder = (orderId: string): Promise<void> =>
    performRefund(orderId)
        .then(() => undefined)
        .catch((error: unknown) => {
            if (!(error instanceof RefundLeftOpenError)) throw error;
            // Stryker disable all
            logger.error({
                message: `Payments: the refund for order ${orderId} was refused — its record is open, and the refund sweep tries again`,
                error
            });
            // Stryker restore all
        });

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
 * Give back the money for goods a customer returned, or for a remainder cancelled before it
 * shipped — `returns`' one door into the refund. The amount is clamped to what the payment still
 * has left, so a goodwill refund made earlier (or one racing it) can never make a return over-refund; the refund is
 * recorded as `return` (or `cancellation`) and carries `returnId`, so `returns` can close the
 * return when the money lands — now, or later when the sweep finishes it.
 *
 * A provider refusal throws after the refund is recorded as `failed`: the sweep will retry it and
 * `returns` will hear of it then.
 *
 * @param orderId - the returned order
 * @param input - which return this pays for, and whether it is a `return` (the default) or a
 *   remainder `cancellation`, how much (a decimal in the payment's currency), and
 *   which goods and delivery that amount covers — what the credit note credits at their own rates
 * @param context - the staff member who received the goods, audited on the refund
 * @returns the payment as it now stands, and whether the refund was left open for an operator (a
 *   hand-paid payment: the return stays `received` until `settleRefundByHand`); or `null` when
 *   there is nothing to return — no succeeded payment, nothing left of it, or a zero amount
 * @throws Error when money would move and the caller is not one {@link mayReturnMoney} allows; the
 *   refusal is audited as `security.forbidden`. The amount is the caller's word, so the caller must
 *   be one that already judged the return.
 */
export const refundForReturn = (
    orderId: string,
    input: {
        returnId: string;
        amount: number;
        lines: RefundLine[];
        shipping: number;
        reason?: Extract<RefundReason, 'return' | 'cancellation'>;
    },
    context: CallerContext
): Promise<RefundOutcome | null> =>
    paymentRepository.findByOrderId(orderId).then((payment) => {
        if (payment?.status !== REFUNDABLE_PAYMENT_STATUS) return null;

        const reason = input.reason ?? 'return';
        if (!mayReturnMoney(payment, reason, context)) {
            auditForbidden(context, {
                targetType: 'payment',
                targetId: String(payment._id),
                metadata: { reason: 'missing_permission', permission: 'receive:Return' }
            });
            throw new Error(
                '[payments] refundForReturn: the caller may not return money for a return.'
            );
        }

        if (toMinorUnits(input.amount, payment.currency) <= 0 || remainingOf(payment) <= 0)
            return null;

        return performRefund(orderId, context, {
            amount: input.amount,
            capAtRemaining: true,
            reason,
            returnId: input.returnId,
            lines: input.lines,
            shipping: input.shipping
        });
    });
