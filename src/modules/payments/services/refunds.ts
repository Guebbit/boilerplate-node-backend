/**
 * @module
 * Giving money back — the operator action (`refundPayment`) and the `order.canceled` listener's
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
import {
    RefundFailureReason,
    RefundStatus,
    type CallerContext,
    type PaidOutside,
    type RefundReason
} from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import type { DomainEventMap } from '@kernel/events';
import { announceInTransaction, enqueueOutboxEvent, nudgeOutbox } from '@kernel/outbox';
import { withTransaction } from '@infrastructure/runtime/database';
import { systemCallerContext } from '@kernel/permissions';
import {
    fitsCurrency,
    toMinorUnits,
    toDecimalString,
    addMoney,
    minMoney,
    subtractMoney,
    padDecimal
} from '@domain-primitives/money';
import { orderService, withdrawalRefundDueBy } from '@modules/orders';
import { ownOrderFlag } from '@modules/access';
import { shopTimezone } from '@modules/shop';
import { paymentsAuditActions } from '../audit';
import { PaymentProviderError } from '../providers';
import { paymentProviderRegistry } from '../providers/registry';
import { paymentEffectRetryMinutes } from '../config';
import { paymentRepository } from '../repository';
import { PAYMENT_REFUND_CANCELED, PAYMENT_REFUND_OWED_BY_HAND } from '../events';
import type { PaymentDocument, RefundLine, RefundRecord } from '../model';
import {
    exceedsRemaining,
    hasOpenChargeback,
    isHandRecorded,
    isOpenRefund,
    mayBeCanceled,
    mayBeSettledByHand,
    OPEN_REFUND_STATUSES,
    REFUNDABLE_PAYMENT_STATUS,
    type RefundDue
} from '../domain';
import {
    announceRefund,
    isFullyRefunded,
    recordRefundFailure,
    refundedPayload,
    refundRow,
    remainingOf,
    settleRefund,
    settleWithin,
    stampOrder
} from './refund-settlement';
import { rereadRefund } from './refund-sync';
import { callerScope } from './scope';
import { ERROR_CODES } from '@api/error-codes';
import { paymentNotFound, RefundLeftOpenError } from './errors';
import { MINUTE_MS } from '@domain-primitives/time';

/** A refund request: amount (absent means all still refundable), reason, and the cancel event it answers. */
export interface RefundRequest {
    /** A decimal in the payment's currency; absent means everything still refundable. */
    amount?: string;
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
    shipping?: string;
    /**
     * Take at most what is left instead of refusing when the figure no longer fits. A return's
     * amount is clamped on a read that a racing refund can outdate; the re-read after a missed
     * write then refunds the rest, not nothing.
     */
    capAtRemaining?: boolean;
    /** The legal deadline this record is stamped with when it opens; absent when the law sets none. */
    due?: RefundDue;
    /**
     * The `order.canceled` event this request answers, when the outbox delivered it. The record it
     * opens stamps the id on the payment in the same write, so a redelivery cannot open another.
     */
    cancelEventId?: string;
    /**
     * Staff say the money already went back outside the application. The record is then born
     * settled by hand, in the transaction that opens it ({@link refundOutside}): no provider is
     * asked, nothing is left `pending` for the sweep, and no owed-by-hand to-do is announced.
     */
    paidOutside?: PaidOutside;
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

/** Result of one refund call; `leftOpen` means money waits on a provider answer or an operator. */
export interface RefundOutcome {
    /** The payment as it now stands. */
    payment: PaymentDocument;
    /**
     * `true` when the record was opened but not settled: hand-paid money waits for an operator,
     * and a card refund the provider accepted waits for its answer.
     */
    leftOpen: boolean;
    /** The record this call wrote (or, when it only finished earlier ones, the newest). */
    refundId: string;
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
    const reason = error instanceof PaymentProviderError ? error.code : RefundFailureReason.unknown;
    // A timeout or a 5xx is no answer about THIS refund: the wording must not say it was refused.
    const unclear =
        reason === RefundFailureReason.unknown ||
        reason === RefundFailureReason.provider_unavailable;
    logger.warn({
        message: unclear
            ? 'No answer from the provider for a refund.'
            : 'The provider refused a refund.',
        refundId: String(refund._id),
        error: extractErrorMessage(error, String(error)).slice(0, MAX_ERROR_LENGTH)
    });
    return reason;
};

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
 * `settleRefundByHand`: it is what the needs-attention list shows. Receiving a parcel or
 * withdrawing a basket is not returning cash, so only an operator who says the money is already
 * back (`paidOutside`, see {@link refundOutside}) settles it on the spot; every other caller
 * leaves it for the operator.
 *
 * Idempotent: the record reserves the amount, so a redelivery finds nothing left to open and
 * writes nothing.
 *
 * @param payment - the payment, still `succeeded`
 * @param request - what to return; a cancellation takes everything still left
 * @param context - the caller, absent for the `order.canceled` listener
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
        return {
            payment: opened.payment,
            leftOpen: true,
            refundId: String(opened.refund._id)
        };
    });

/**
 * Announce a refund that opened on a hand-recorded payment, in the transaction that opens it: the
 * money is owed outside the app, so a person has to send it. A card refund is sent by the
 * provider and announces nothing here.
 *
 * @param payment - the payment the refund is taken from
 * @param refund - the record being opened
 * @param session - the transaction that opens it
 */
const announceOwedByHand = (
    payment: PaymentDocument,
    refund: RefundRecord,
    session: ClientSession
): Promise<void> =>
    isHandRecorded(payment)
        ? enqueueOutboxEvent(
              PAYMENT_REFUND_OWED_BY_HAND,
              {
                  paymentId: String(payment._id),
                  orderId: String(payment.orderId),
                  refundId: String(refund._id),
                  amount: padDecimal(refund.amount, refund.currency),
                  currency: refund.currency
              },
              String(payment.orderId),
              session
          )
        : Promise.resolve();

/** How many times a stamped refund write may miss and be retried before the call throws. */
export const CANCEL_EVENT_WRITE_RETRIES = 5;

/**
 * Whether the payment already handled the cancel event a request answers. The write that opens a
 * refund misses on exactly this, and a re-read that retried it would never stop.
 *
 * @param payment - the payment, freshly read
 * @param request - the request, carrying its cancel event id when it has one
 */
const handledCancelEvent = (payment: PaymentDocument, request: RefundRequest): boolean =>
    request.cancelEventId !== undefined &&
    payment.handledCancelEvents.includes(request.cancelEventId);

/**
 * Open a refund on a payment: reserve the amount and append its record in one conditional write.
 *
 * A miss means another write moved `amountRefunded` between the caller's read and this one — so the
 * payment is re-read and the whole check runs again against what is really left, instead of
 * refunding from a stale figure. Each miss means someone else made progress, so it ends. A miss
 * because the request's cancel event was handled meanwhile ends at once, with `null`; a stamped
 * request whose write keeps missing throws after {@link CANCEL_EVENT_WRITE_RETRIES} retries.
 *
 * The order's timeline row commits with the record, in one transaction: a refund exists exactly
 * when its `refund_issued` does.
 *
 * @param payment - the payment as the caller read it
 * @param request - the amount (absent = everything left) and the reason
 * @param actor - the operator who asked, when one did; absent for the automatic listener
 * @param session - the caller's transaction, when the record belongs to one (a settlement that
 *   found its order gone); absent, the record opens in a transaction of its own
 * @param retriesLeft - retries left for a stamped request; at zero it throws instead of retrying
 * @returns the opened record and the payment after it, or `null` when nothing (or not that much)
 *   is left to refund
 */
export const openRefund = (
    payment: PaymentDocument,
    request: RefundRequest,
    actor?: string | null,
    session?: ClientSession,
    retriesLeft = CANCEL_EVENT_WRITE_RETRIES
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
        amount: toDecimalString(amount, currency),
        currency,
        status: 'pending' as const,
        /**
         * Stamped here, not left to mongoose: this exact object is what the caller sends to the
         * provider, and the port reads `createdAt` to decide whether a key has expired.
         */
        createdAt: new Date(),
        reason: request.reason,
        ...(request.returnId ? { returnId: request.returnId } : {}),
        ...request.due,
        ...(request.paidOutside ? { paidOutside: request.paidOutside } : {}),
        ...(request.lines ? { lines: request.lines, shipping: request.shipping ?? '0' } : {}),
        /**
         * One key per RECORD, not per payment: two different partial refunds must not be taken
         * for one by the provider, while a retry of this one must be.
         */
        idempotencyKey: `refund:${String(paymentId)}:${String(refundId)}`,
        /**
         * The fence token of the first attempt, when this request sends the record itself: a
         * settle or a failure only lands while the record still carries it, so a claim by the
         * sweep supersedes this attempt. A record opened inside a caller's transaction is sent
         * after it commits, through a claim, and carries none until then.
         */
        ...(session ? {} : { attemptedAt: new Date() })
    };
    const newTotal = addMoney(toMinorUnits(amountRefunded, currency), amount);

    const write = (active: ClientSession): Promise<PaymentDocument | null> =>
        paymentRepository
            .addRefund(
                String(paymentId),
                amountRefunded,
                toDecimalString(newTotal, currency),
                refund,
                active,
                request.cancelEventId
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
                          // A record born settled is owed to nobody: it would open a to-do that closes at once.
                          .then(() =>
                              request.paidOutside
                                  ? undefined
                                  : announceOwedByHand(payment, refund, active)
                          )
                          .then(() => updated)
                    : updated
            );

    return (
        session
            ? write(session)
            : withTransaction(write).then((written) => {
                  if (written) nudgeOutbox();
                  return written;
              })
    ).then((updated) => {
        if (updated) return { payment: updated, refund };
        /**
         * Inside a caller's transaction the payment is the one that caller just wrote: a miss is
         * final, and a re-read outside the transaction would see something older.
         */
        if (session) return null;
        /**
         * A stamped request never gives up quietly: `null` would let the caller mark the event
         * handled with no refund opened. Throwing leaves it unmarked, so the outbox redelivers.
         */
        if (request.cancelEventId !== undefined && retriesLeft <= 0)
            throw new Error(
                `Payments: the refund for order ${String(orderId)} could not be opened, its write kept missing`
            );
        return paymentRepository
            .findByOrderId(String(orderId))
            .then((fresh) =>
                fresh?.status === REFUNDABLE_PAYMENT_STATUS && !handledCancelEvent(fresh, request)
                    ? openRefund(fresh, request, actor, undefined, retriesLeft - 1)
                    : null
            );
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
 * @param context - the caller; the `order.canceled` listener has none and writes no row
 */
export const auditRefundRequested = (
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
 * The provider accepted the refund but has not settled it: keep its refund id on the record and
 * leave the record `pending`. Nothing is announced (no `payment.refunded`, no credit note) until a
 * re-read says it succeeded, and the sweep re-reads it instead of sending it again.
 *
 * @param refund - the record, as the attempt claimed it
 * @param refundRef - the provider's refund id
 * @returns always `null`: nothing settled here
 */
const keepPending = (
    payment: PaymentDocument,
    refund: RefundRecord,
    refundRef: string
): Promise<null> =>
    paymentRepository
        // `attemptedAt` is always there on a record this code opened or claimed.
        .attachRefundRef(String(payment._id), String(refund._id), refund.attemptedAt!, refundRef)
        .then(() => null);

/**
 * Ask the provider to return one refund's money, and record its answer. A refusal marks the record
 * `failed` and throws {@link RefundLeftOpenError}; the record stays open for the refund sweep, and
 * the caller (the `order.canceled` listener) logs it instead of rethrowing.
 *
 * @param payment - the payment (never `manual`)
 * @param refund - the record to send
 * @param providerRef - the provider's own id for the payment; absent only on a corrupted row,
 * which fails the record final as `provider_removed`
 * @param context - present only for the admin request
 */
const sendToProvider = (
    payment: PaymentDocument,
    refund: RefundRecord,
    providerRef: string | undefined,
    context: CallerContext | undefined
): Promise<PaymentDocument | null> => {
    const refuse = (error: unknown, reason: RefundFailureReason): Promise<never> =>
        recordRefundFailure(payment, refund, reason).then(() => {
            throw new RefundLeftOpenError(error, String(refund._id));
        });

    /**
     * An open chargeback: the bank has this money. Nothing is asked of the provider (it would
     * refuse with `charge_disputed` anyway); the record fails final, as that refusal would.
     */
    if (hasOpenChargeback(payment))
        return refuse(
            new Error('A chargeback is open on this payment'),
            RefundFailureReason.disputed
        );

    /**
     * The adapter code may be gone (a provider retired from the deployment): nothing was asked,
     * so the money provably did not move, and asking again will not change that.
     */
    const provider = paymentProviderRegistry.resolve(payment.provider);
    if (!provider) {
        logger.warn({
            message: `No payment provider "${payment.provider}" is registered; a refund on it cannot be sent.`,
            refundId: String(refund._id)
        });
        return refuse(
            new Error(`Unknown payment provider: ${payment.provider}`),
            RefundFailureReason.provider_removed
        );
    }

    /**
     * Only a `succeeded` payment reaches here, and nothing can succeed before the provider has been
     * asked for an intent — so a missing reference is a corrupted row, not a reachable state. Nothing
     * was asked, so the money provably did not move: the record fails final and staff see the
     * refund-refused task, instead of a credit note and a mail for money that never left.
     */
    if (!providerRef) {
        logger.error({
            message: 'Refund on a payment carrying no provider reference — money was NOT returned.',
            orderId: String(payment.orderId),
            refundId: String(refund._id)
        });
        return refuse(
            new Error('The payment carries no provider reference'),
            RefundFailureReason.provider_removed
        );
    }

    // Inside a chain: an adapter that throws before returning a promise is still a refusal.
    return Promise.resolve()
        .then(() =>
            provider.refund(
                providerRef,
                { amount: refund.amount, currency: refund.currency },
                {
                    idempotencyKey: refund.idempotencyKey,
                    refundId: String(refund._id),
                    createdAt: refund.createdAt
                }
            )
        )
        .then(
            ({ refundRef, status }) =>
                status === 'pending'
                    ? keepPending(payment, refund, refundRef)
                    : settleRefund(
                          payment,
                          refund,
                          { providerRefundRef: refundRef, attempt: refund.attemptedAt },
                          context
                      ),
            (error: unknown) => refuse(error, failureReasonOf(error, refund))
        );
};

/**
 * Log that an open refund is held back because it no longer fits what the provider holds.
 *
 * @param refund - the held record
 * @returns always `null`: nothing settled
 */
const held = (refund: RefundRecord): null => {
    // Stryker disable all
    logger.warn({
        message:
            'An open refund no longer fits what the provider already gave back; it is held unsent for staff.',
        refundId: String(refund._id)
    });
    // Stryker restore all
    return null;
};

/**
 * Carry one open refund to its end: send the record to the provider. A hand-paid
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

    /**
     * An outside refund took the room this one counted on: the provider would refuse it, so it
     * stays open and unsent for staff to cancel or mark returned.
     */
    if (exceedsRemaining(payment, refund)) return Promise.resolve(held(refund));

    return sendToProvider(payment, refund, payment.providerRef, context);
};

/**
 * Take a record for sending and send it. The claim is one conditional write: it fails for a record
 * that is final, still waiting out its retry delay, or already in the hands of a live attempt, so
 * two callers never send the same record at once. A refusal is the record's own business: it is
 * already `failed` and open for the sweep, so it must not stop the records behind it.
 *
 * @param payment - the payment as the previous record left it
 * @param refund - the record to carry through
 * @param context - present only for the admin request
 * @returns the payment after the refund settled, or `null` when it did not settle here
 * @internal Sends money to the provider: `refundPayment` or `openReturnRefund` has already checked who may.
 */
export const attemptKeepingGoing = (
    payment: PaymentDocument,
    refund: RefundRecord,
    context: CallerContext | undefined
): Promise<PaymentDocument | null> => {
    // Money recorded by hand has no provider to ask, and nothing here may declare it returned.
    if (isHandRecorded(payment)) return Promise.resolve(null);

    // Held before the claim, so the sweep does not claim it again every few minutes.
    if (exceedsRemaining(payment, refund)) return Promise.resolve(held(refund));

    const now = new Date();
    return paymentRepository
        .claimRefund(String(payment._id), String(refund._id), {
            now,
            staleBefore: new Date(now.getTime() - paymentEffectRetryMinutes() * MINUTE_MS)
        })
        .then((claimed) => {
            const taken = claimed?.refunds.find(({ _id }) => String(_id) === String(refund._id));
            return claimed && taken ? attemptRefund(claimed, taken, context) : null;
        })
        .catch((error: unknown) => {
            if (error instanceof RefundLeftOpenError) return null;
            throw error;
        });
};

/**
 * Finish the refunds a payment still has open — the same records, the same idempotency keys, so a
 * provider that already returned the money answers with the refund it already made.
 *
 * A record the provider refuses stays open and the next one is still tried; any other error (the
 * database, say) stops the walk, as nothing after it can be trusted to land either.
 *
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
        if (!statuses.includes(refund.status) || !isOpenRefund(refund)) continue;
        // A refund the provider already holds is asked about, never sent again.
        const after = await (refund.providerRefundRef && refund.status === RefundStatus.pending
            ? rereadRefund(current, refund)
            : attemptKeepingGoing(current, refund, context));
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
export const settledElsewhere = (
    orderId: string,
    refund: RefundRecord
): Promise<PaymentDocument | null> =>
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
 * A refund this caller sent that is still open although nobody refused it: the provider accepted it
 * without settling (`pending`, holding its refund id), or reported it failed while the request was
 * still in flight. The record is the caller's answer, owed or waiting, not a refusal to raise.
 *
 * @param orderId - the order whose payment carries the record
 * @param refund - the record this caller opened
 * @returns the outcome with `leftOpen`, or `null` when the record is not open
 */
const openAtProvider = (orderId: string, refund: RefundRecord): Promise<RefundOutcome | null> =>
    paymentRepository
        .findByOrderId(orderId)
        .then((fresh) =>
            fresh?.refunds.some(
                (record) => String(record._id) === String(refund._id) && isOpenRefund(record)
            )
                ? { payment: fresh, leftOpen: true, refundId: String(refund._id) }
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
 * @returns the payment after the refund settled and the record this call wrote, or `null` when
 *   nothing settled here
 */
const performCardRefund = (
    orderId: string,
    payment: PaymentDocument,
    context: CallerContext | undefined,
    request: RefundRequest
): Promise<RefundOutcome | null> =>
    settleOpenRefunds(payment, context, [RefundStatus.pending]).then(
        ({ payment: current, settled }) => {
            if (remainingOf(current) <= 0)
                return settled && current.refunds.length > 0
                    ? {
                          payment: current,
                          leftOpen: false,
                          refundId: String(current.refunds.at(-1)?._id)
                      }
                    : null;

            return openRefund(current, request, context?.caller.id).then((opened) => {
                if (!opened) return null;
                auditRefundRequested(opened.payment, opened.refund, context);
                return attemptRefund(opened.payment, opened.refund, context)
                    .then((after) => after ?? settledElsewhere(orderId, opened.refund))
                    .then((after) =>
                        after
                            ? {
                                  payment: after,
                                  leftOpen: false,
                                  refundId: String(opened.refund._id)
                              }
                            : openAtProvider(orderId, opened.refund)
                    );
            });
        }
    );

/** How many times a refund recorded as paid outside re-reads the payment when a racing write moved the total. */
const OUTSIDE_WRITE_ATTEMPTS = 3;

/**
 * Open a refund and settle it by hand inside the caller's transaction: the record is born
 * `succeeded` with `settledByHand`, so nothing can ever send it to a provider and the sweep never
 * sees it as open. A miss (a racing write moved the running total) re-reads the payment inside the
 * same transaction and tries again, up to {@link OUTSIDE_WRITE_ATTEMPTS}.
 *
 * @param payment - the payment as the caller read it
 * @param request - what to return; its `paidOutside` is what makes the record settled
 * @param actor - the operator who said the money went back
 * @param session - the transaction the two writes, the timeline rows and `payment.refunded` share
 * @param attemptsLeft - reads left before a miss is final
 * @returns the payment and the settled record, or `null` when nothing (or not that much) was left
 * @internal Writes a settled refund: `mayRefundOutside` has already checked who may.
 */
export const openSettledOutside = (
    payment: PaymentDocument,
    request: RefundRequest,
    actor: string | null | undefined,
    session: ClientSession,
    attemptsLeft = OUTSIDE_WRITE_ATTEMPTS
): Promise<OpenedRefund | null> =>
    openRefund(payment, request, actor, session).then((opened) => {
        if (opened)
            return settleWithin(
                opened.payment,
                opened.refund,
                { settledByHand: true, from: [RefundStatus.pending] },
                session,
                actor
            ).then((final) => (final ? { payment: final, refund: opened.refund } : null));
        if (attemptsLeft <= 1) return null;
        return paymentRepository
            .findByOrderId(String(payment.orderId), undefined, session)
            .then((fresh) =>
                fresh?.status === REFUNDABLE_PAYMENT_STATUS
                    ? openSettledOutside(fresh, request, actor, session, attemptsLeft - 1)
                    : null
            );
    });

/**
 * A refund staff already paid outside the application (cash at the counter, a bank transfer):
 * opened and settled by hand in ONE transaction, on a card payment or a hand-paid one alike. The
 * provider is never asked, so the buyer is not paid twice; the settlement is the ordinary one
 * (order stamp, timeline, `payment.refunded` for the credit note and the buyer's mail).
 *
 * @param payment - the `succeeded`, not-yet-fully-refunded payment
 * @param request - the amount, the reason and the `paidOutside` statement
 * @param context - the operator, audited as `admin.payment.refund_settled_by_hand`
 * @returns the settled outcome, or `null` when nothing was left to refund
 */
const refundOutside = (
    payment: PaymentDocument,
    request: RefundRequest,
    context: CallerContext | undefined
): Promise<RefundOutcome | null> =>
    withTransaction((session) =>
        openSettledOutside(payment, request, context?.caller.id, session)
    ).then((done) => {
        if (!done) return null;
        nudgeOutbox();
        announceRefund(done.payment, done.refund, context, 'success', true);
        return { payment: done.payment, leftOpen: false, refundId: String(done.refund._id) };
    });

/**
 * Refund an order's payment — the operator action, and the listener's compensation.
 *
 * A card payment finishes any refund still open first, so a retried cancel completes the refund it
 * already started instead of opening a second one for the same money. A hand-paid payment only
 * gets a record opened and left `pending` ({@link leaveForOperator}), whoever asked — unless the
 * request says the money already went back outside ({@link refundOutside}), on any payment.
 *
 * @param orderId - the order whose payment is being returned
 * @param context - present only for a request with a caller (`refundPayment`);
 *  the `order.canceled` listener (`refundForOrder`) has none
 * @param request - the amount and the reason; omitted, it is everything left, for a cancellation
 * @returns the payment as it now stands — always still `succeeded`, whatever was returned (its
 *   `displayStatus` says how much) — and whether the record was left open for an operator; or
 *   `null` when there was nothing to return
 * @internal The step beneath `refundPayment` and `refundForOrder`, which carry
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

        if (request.paidOutside) return refundOutside(payment, request, context);

        if (isHandRecorded(payment)) return leaveForOperator(payment, request, context);

        return performCardRefund(orderId, payment, context, request);
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
    body: { amount?: string; currency?: string }
): ResponseReject | undefined => {
    const { amount, currency } = body;
    if (currency !== undefined && currency !== payment.currency)
        return generateReject(422, [
            fieldError('currency', t('payments.refund-currency-mismatch'))
        ]);
    if (amount === undefined) return undefined;

    /**
     * A decimal the currency has no minor unit for (0.001 EUR) would round to a different amount
     * than the one the operator typed — refused rather than quietly changed.
     */
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

/** What a successful `POST /payments/:id/refunds` answers with: the payment, and the record the request wrote. */
export interface RefundRequested {
    /** The payment as it now stands. */
    payment: PaymentDocument;
    /** The id of the record THIS request wrote, whatever became of it. */
    refundId: string;
}

/**
 * A refund the provider refused, answered as the 201 it is: the record exists and counts against
 * what is left, whatever the provider said. Not a 5xx, which would say nothing happened and
 * invite a second click that opens a second partial refund.
 *
 * @param paymentId - the payment carrying the record
 * @param refused - the refusal, naming the record it left open
 * @param authContext - the caller, so the payment is re-read through the same scope
 */
const refusedRefundAnswer = (
    paymentId: string,
    refused: RefundLeftOpenError,
    authContext: AuthContext | undefined
): Promise<ResponseSuccess<RefundRequested> | ResponseReject> =>
    paymentRepository
        .findByIdScoped(paymentId, callerScope(authContext))
        .then((payment) =>
            payment
                ? generateSuccess({ payment, refundId: refused.refundId }, 201)
                : paymentNotFound()
        );

/**
 * The operator's refund of a payment that exists: refuse a body that cannot stand, otherwise
 * refund and answer with the payment as it now stands and the record this request wrote. On a
 * hand-paid payment that is the record left `pending`: `settleRefundByHand` is what says the money
 * went back. A provider refusal is an answer too ({@link refusedRefundAnswer}), not an error.
 *
 * @param payment - the payment, read through the caller's scope
 * @param body - the amount to return, or none for what is left
 * @param context - the operator, audited on the refund
 * @param authContext - the caller, for re-reading the payment after a refusal
 */
const refundFoundPayment = (
    payment: PaymentDocument,
    body: { amount?: string; paidOutside?: PaidOutside },
    context: CallerContext,
    authContext: AuthContext | undefined
): Promise<ResponseSuccess<RefundRequested> | ResponseReject> => {
    const invalid = refusalFor(payment, body);
    if (invalid) return Promise.resolve(invalid);
    // An open chargeback: the bank took the money back already, and refunding too pays it twice.
    if (hasOpenChargeback(payment))
        return Promise.resolve(
            generateReject(409, [
                { code: ERROR_CODES.PAYMENT_DISPUTED, message: t('payments.disputed') }
            ])
        );
    /**
     * The `PaymentActions.refund` rule. A refund still open counts against what is left, so only
     * an exhausted payment is refused; a second partial refund beside an open one is allowed.
     */
    if (payment.status !== REFUNDABLE_PAYMENT_STATUS || remainingOf(payment) <= 0)
        return Promise.resolve(notRefundable());

    return performRefund(String(payment.orderId), context, {
        amount: body.amount,
        reason: 'goodwill',
        ...(body.paidOutside ? { paidOutside: body.paidOutside } : {})
    }).then(
        (refunded) =>
            refunded
                ? generateSuccess({ payment: refunded.payment, refundId: refunded.refundId }, 201)
                : notRefundable(),
        (error: unknown) => {
            // Only a refusal: any other error means the record may not exist, and stays a 5xx.
            if (error instanceof RefundLeftOpenError)
                return refusedRefundAnswer(String(payment._id), error, authContext);
            throw error;
        }
    );
};

/**
 * `POST /payments/:id/refunds` — the operator returning money on its own, separate from
 * cancelling. Admin-only at the route.
 *
 * @param paymentId - the payment whose money is being returned
 * @param authContext - the caller, for the read that distinguishes 404 from 409
 * @param context - the caller context to audit the refund against
 * @param body - the optional `amount` (absent = everything left), its `currency`, and `paidOutside`
 *   when staff already gave the money back outside the application: the record is then born settled
 * @returns the payment as it now stands with the record this request wrote, or a refusal naming
 *   which case it was
 */
export const refundPayment = (
    paymentId: string,
    authContext: AuthContext | undefined,
    context: CallerContext,
    body: { amount?: string; currency?: string; paidOutside?: PaidOutside } = {}
): Promise<ResponseSuccess<RefundRequested> | ResponseReject> =>
    paymentRepository
        .findByIdScoped(paymentId, callerScope(authContext))
        .then((payment) =>
            payment ? refundFoundPayment(payment, body, context, authContext) : paymentNotFound()
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
    if (!isOpenRefund(refund)) return handRefundNotOpen();
    return mayBeSettledByHand(payment, refund) ? undefined : refundInFlight();
};

/**
 * The 409 for a card refund that has no final answer yet: an attempt is running, or the provider
 * did not say whether the money moved. Settling it by hand could pay the buyer twice.
 */
const refundInFlight = (): ResponseReject =>
    generateReject(409, [
        { code: ERROR_CODES.PAYMENT_REFUND_IN_FLIGHT, message: t('payments.refund-in-flight') }
    ]);

/**
 * The answer for an operator who lost the settle: 409 `NOT_OPEN` if the money is back already,
 * `IN_FLIGHT` if the record moved on to a new attempt.
 *
 * @param refundId - the record the operator named
 */
const lostSettleRace = (paymentId: string, refundId: string): Promise<ResponseReject> =>
    paymentRepository
        .findByIdScoped(paymentId)
        .then((fresh) =>
            fresh?.refunds.some(
                (record) =>
                    String(record._id) === refundId && record.status === RefundStatus.pending
            )
                ? refundInFlight()
                : handRefundNotOpen()
        );

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
 * credit note, and the close of a return that waits on it), with `settledByHand` on the record.
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
        const refund = payment?.refunds.find((record) => String(record._id) === refundId);
        // The same 404 as an unknown payment: a refund id is read only through its payment.
        if (!payment || !refund) return paymentNotFound();

        const refusal = handSettlementRefusal(payment, refund);
        if (refusal) return refusal;

        /**
         * `null` is the loser of a race: the conditional write found the record no longer in the
         * state it was read in (settled by a second operator, or claimed for a new attempt).
         */
        return settleRefund(
            payment,
            refund,
            { settledByHand: true, from: [refund.status] },
            context
        ).then((final): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
            final
                ? Promise.resolve(generateSuccess(final, 200))
                : lostSettleRace(paymentId, refundId)
        );
    });

/**
 * The refusal `cancelRefund` earns before anything is written, if any: the record is closed
 * already (settled or canceled), or it may have moved money (an attempt running, an unclear
 * failure).
 *
 * @param payment - the payment the refund sits on
 * @param refund - the record the operator names
 */
const cancelRefusal = (
    payment: PaymentDocument,
    refund: RefundRecord
): ResponseReject | undefined => {
    if (!isOpenRefund(refund)) return handRefundNotOpen();
    return mayBeCanceled(payment, refund) ? undefined : refundInFlight();
};

/**
 * The `payment.refund_canceled` payload: the voided record and the money it held.
 *
 * @param payment - the payment after the cancel
 * @param refund - the record that was voided, as it was read
 */
const canceledPayload = (
    payment: PaymentDocument,
    refund: RefundRecord
): DomainEventMap['payment.refund_canceled'] => ({
    paymentId: String(payment._id),
    orderId: String(payment.orderId),
    refundId: String(refund._id),
    amount: padDecimal(refund.amount, refund.currency),
    currency: refund.currency
});

/**
 * Void one refund and release its share, in the caller's transaction: the conditional write, then
 * the order's staff-only timeline row, then the order's `paymentStatus` stamp when a refund has
 * settled. The stamp is recomputed because an open record blocks `refunded`: cancelling the last
 * one (the rest of the money came back from the dashboard) is what lets it read `refunded`.
 * With no settled refund the order is left alone: nothing moved, so there is nothing to stamp.
 *
 * @param payment - the payment as read
 * @param refund - the record being canceled, as read
 * @param context - the operator
 * @param session - the transaction both writes join
 * @returns the payment after the cancel, or `null` when the record or the total moved since the read
 */
const writeCancel = (
    payment: PaymentDocument,
    refund: RefundRecord,
    context: CallerContext,
    session: ClientSession
): Promise<PaymentDocument | null> =>
    paymentRepository
        .cancelRefund(
            String(payment._id),
            String(refund._id),
            { status: refund.status, failureReason: refund.failureReason },
            {
                expectedRefunded: payment.amountRefunded,
                newRefunded: toDecimalString(
                    subtractMoney(
                        toMinorUnits(payment.amountRefunded, payment.currency),
                        toMinorUnits(refund.amount, payment.currency)
                    ),
                    payment.currency
                )
            },
            session
        )
        .then((final) =>
            final
                ? orderService
                      .appendTimeline(
                          String(final.orderId),
                          {
                              type: 'refund_canceled',
                              actor: context.caller.id,
                              data: refundRow(refund)
                          },
                          session
                      )
                      .then(() =>
                          final.refunds.some((record) => record.status === RefundStatus.succeeded)
                              ? stampOrder(final, session)
                              : undefined
                      )
                      .then(() => final)
                : null
        );

/**
 * `POST /payments/:id/refunds/:refundId/cancel` — staff voiding a refund that must never be paid
 * (a duplicate, or one the provider's dashboard already covered). Local only: nothing is sent to
 * the provider, no credit note is issued and the buyer is not mailed, because no money moved.
 *
 * A miss on the conditional write means the record or the total moved since the read (a sweep
 * claimed it, a racing refund opened beside it): the whole check runs again against what is really
 * there, a few times at most, then the loser is told the record is no longer cancelable.
 *
 * @param paymentId - the payment carrying the refund
 * @param refundId - the refund record to cancel
 * @param note - why, for the audit row
 * @param authContext - the caller, for the read that distinguishes 404 from 409
 * @param context - the operator, audited
 * @param retriesLeft - how many more times a lost race may re-run the check
 * @returns the payment as it now stands, or a refusal naming which case it was
 */
export const cancelRefund = (
    paymentId: string,
    refundId: string,
    note: string,
    authContext: AuthContext | undefined,
    context: CallerContext,
    retriesLeft = 3
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
    paymentRepository.findByIdScoped(paymentId, callerScope(authContext)).then((payment) => {
        const refund = payment?.refunds.find((record) => String(record._id) === refundId);
        // The same 404 as an unknown payment: a refund id is read only through its payment.
        if (!payment || !refund) return paymentNotFound();

        const refusal = cancelRefusal(payment, refund);
        if (refusal) return refusal;

        return announceInTransaction(
            (session) => writeCancel(payment, refund, context, session),
            (final) => ({
                name: PAYMENT_REFUND_CANCELED,
                payload: canceledPayload(final, refund),
                aggregateId: String(final.orderId)
            })
        ).then(
            (
                final
            ):
                | ResponseSuccess<PaymentDocument>
                | Promise<ResponseSuccess<PaymentDocument> | ResponseReject> => {
                if (final) {
                    recordAudit(context, {
                        action: paymentsAuditActions.ADMIN_PAYMENT_REFUND_CANCELED,
                        outcome: 'success',
                        targetType: 'order',
                        targetId: String(final.orderId),
                        metadata: { refundId, amount: refund.amount, note }
                    });
                    return generateSuccess(final, 200);
                }
                return retriesLeft > 0
                    ? cancelRefund(paymentId, refundId, note, authContext, context, retriesLeft - 1)
                    : Promise.resolve(refundInFlight());
            }
        );
    });

/** What {@link refundForOrder} reads off the `order.canceled` fact. */
type CanceledOrder = Pick<DomainEventMap['order.canceled'], 'cause' | 'informedAt'>;

/**
 * The refund request of a cancel, stamped with its legal deadline when the buyer's own act caused
 * it: a withdrawal before dispatch, or a paid order the buyer canceled, is due 14 days after the
 * shop was told (Directive 2011/83/EU Art. 13(1)). The shop's own cancels, and every system cause,
 * carry no legal deadline.
 *
 * @param canceled - the `order.canceled` fact
 */
const cancellationRequestOf = (canceled: CanceledOrder | undefined): RefundRequest => {
    if (!canceled) return CANCELLATION_REQUEST;
    const buyersOwnAct = canceled.cause === 'withdrawal' || canceled.cause === 'customer';
    if (!buyersOwnAct || canceled.informedAt === undefined) return CANCELLATION_REQUEST;
    return {
        ...CANCELLATION_REQUEST,
        due: {
            dueBy: withdrawalRefundDueBy(new Date(canceled.informedAt), shopTimezone()),
            dueRule: 'withdrawal'
        }
    };
};

/**
 * The `order.canceled` listener's refund: give the money back if any was taken. The event is the
 * only promise of it, delivered by the outbox until this resolves.
 *
 * Idempotent: the payment remembers every event id it handled, even one with nothing to return, so
 * a redelivery skips it before any write. {@link retryOpenRefunds} finishes an open record, with
 * the same idempotency key; a provider refusal ({@link RefundLeftOpenError}) is logged, not
 * rethrown. A throw BEFORE the event is marked (database down) still rejects, and the outbox
 * delivers the event again. With no `eventId` (an in-process emit) nothing is remembered.
 *
 * A hand-paid order opens its record and waits for an operator (`leaveForOperator`).
 *
 * @param orderId - the order that was canceled
 * @param canceled - why it was canceled and when the buyer told the shop, from the `order.canceled` fact
 * @param eventId - the outbox row id of the delivery; absent for an in-process emit
 * @internal The `order.canceled` listener's refund, which has no caller of its own to check: only
 *   this module's `subscribe` may run it, so it is not on `paymentService`.
 */
export const refundForOrder = (
    orderId: string,
    canceled?: CanceledOrder,
    eventId?: string
): Promise<void> =>
    (eventId === undefined
        ? Promise.resolve(false)
        : paymentRepository
              .findByOrderId(orderId)
              .then((payment) => payment?.handledCancelEvents.includes(eventId) === true)
    ).then((handled) =>
        handled
            ? undefined
            : performRefund(orderId, undefined, {
                  ...cancellationRequestOf(canceled),
                  ...(eventId === undefined ? {} : { cancelEventId: eventId })
              })
                  .then(() => undefined)
                  .catch((error: unknown) => {
                      if (!(error instanceof RefundLeftOpenError)) throw error;
                      // Stryker disable all
                      logger.error({
                          message: `Payments: the refund for order ${orderId} was refused — its record is open, and the refund sweep tries again`,
                          error
                      });
                      // Stryker restore all
                  })
                  /**
                   * Every outcome that did not throw is a handled event: the refund opened (already
                   * stamped, this is a no-op), or there was nothing to return.
                   */
                  .then(() =>
                      eventId === undefined
                          ? undefined
                          : paymentRepository.markCancelEventHandled(orderId, eventId)
                  )
    );

/**
 * One `payment.refunded` payload per refund that settled on an order's payment, oldest settlement
 * first: what `invoicing` replays to issue the credit notes a dead invoice event made it miss. A
 * refund the provider later took back keeps its `settledAt`-era note, so it is included only while
 * it still carries one; a settled-by-hand record has `settledAt` too.
 *
 * @returns the payloads; empty when the order has no payment or nothing settled
 */
export const settledRefundPayloads = (
    orderId: string
): Promise<DomainEventMap['payment.refunded'][]> =>
    paymentRepository.findByOrderId(orderId).then((payment) =>
        payment
            ? payment.refunds
                  .filter((refund) => refund.status === RefundStatus.succeeded && refund.settledAt)
                  .toSorted((a, b) => (a.settledAt?.getTime() ?? 0) - (b.settledAt?.getTime() ?? 0))
                  .map((refund) => refundedPayload(payment, refund))
            : []
    );
