/**
 * @module
 * Reconciling what the provider says about a payment — the browser-driven confirm/sync and the
 * webhook delivery all funnel into {@link settlePayment}, the ONE place money is reconciled. Two
 * copies would drift, and drifted copies commit inventory twice.
 */

import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { PaymentStatus, AuthContext } from '@types';
import {
    orderService,
    bankTransferHoldHours,
    isPayable,
    mailBuyer,
    paymentSettled,
    paymentSucceededEmail,
    toMinorUnits
} from '@modules/orders';
import { inventoryService } from '@modules/inventory';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { withTransaction } from '@infrastructure/runtime/database';
import type { ClientSession } from 'mongoose';
import { enqueueOutboxEvent, nudgeOutbox } from '@kernel/outbox';
import { paymentsAnalyticsEvents } from '../analytics';
import { paymentsAuditActions } from '../audit';
import { paymentAmountMismatchTotal } from '../metrics';
import { SYSTEM_ACTOR, callerForSubject } from '@kernel/permissions';
import { providerNamed, type ProviderPaymentState, type ProviderWebhookEvent } from '../providers';
import { paymentRepository } from '../repository';
import { CONFIRMABLE_PAYMENT_STATUSES, SETTLEABLE_PAYMENT_STATUSES } from '../domain';
import type { PaymentDocument } from '../model';
import { payerScope } from './scope';
import { CANCELLATION_REQUEST, openRefund, performRefund } from './refunds';
import { recordDecline } from './announce';
import { PAYMENT_SUCCEEDED } from '../events';
import { notPayable } from './errors';
import { ERROR_CODES } from '@api/error-codes';

/** What a settlement did, for a caller that has to turn it into an HTTP answer. */
interface Settlement {
    /** The payment as it now stands. */
    payment: PaymentDocument;
    /**
     * Whether the money arrived at a moment when the order could no longer be paid. Putting it
     * straight back was attempted; the payment reads `refunded` when that landed, still
     * `succeeded` when the refund itself failed or the process died first (the retry sweep
     * finishes it either way) — but the caller owes its client a refusal regardless, which is
     * the one thing the status alone does not say.
     */
    orderLost: boolean;
    /**
     * Whether THIS call's own write moved the payment. A call that lost the race (a webhook
     * retry, a poll of something settled) reports `false`, and so reports nothing: the call that
     * won already did.
     */
    transitioned: boolean;
}

/**
 * Which of amount, currency and payment id the provider's `succeeded` disagrees with the payment
 * on. Empty means it matches. A field the provider did not report counts as differing: money that
 * cannot be verified is not accepted.
 *
 * Amounts are compared in minor units, so a float's noise is not a mismatch.
 *
 * @param payment - the payment, as frozen at the intent
 * @param state - what the provider reported
 */
const receiptMismatch = (payment: PaymentDocument, state: ProviderPaymentState): string[] => {
    const fields: string[] = [];
    if (state.currency !== payment.currency) fields.push('currency');
    if (
        state.amountReceived === undefined ||
        toMinorUnits(state.amountReceived, payment.currency) !==
            toMinorUnits(payment.amount, payment.currency)
    )
        fields.push('amount');
    if (state.paymentId !== String(payment._id)) fields.push('paymentId');
    return fields;
};

/**
 * Put the money of a payment that landed on an order nobody can still be paid back.
 *
 * Marker:   written BEFORE the attempt. Unlike a cancel, nothing retries this call itself, so a
 *           throw with no durable note first would lose the refund.
 * Refund:   `performRefund`, not a bare `provider.refund` — the payment ends up saying
 *           `refunded`, through the same at-most-once guard every other refund goes through.
 * Failure:  logged, never rethrown — the caller must still answer its own caller, and `orders`'
 *           own `ORDER_REFUND_OWED` sweep is what finishes it if this attempt didn't.
 *
 * @param orderId - the order whose payment is being returned
 * @returns the payment as the refund left it, or `null` when the refund did not land
 */
const refundLostPayment = async (orderId: string): Promise<PaymentDocument | null> => {
    await orderService.markRefundOwed(orderId);
    const refunded = await performRefund(orderId)
        .then((result) => orderService.clearRefundOwed(orderId).then(() => result))
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: could not refund order ${orderId} after its payment landed on an order no longer payable — left for the retry sweep`,
                error
            });
            // Stryker restore all
            return null;
        });
    return refunded;
};

/** The caller context a settlement acts under when no request is behind it. */
const systemContext = (subject: 'Order' | 'Payment'): CallerContext => ({
    caller: callerForSubject(SYSTEM_ACTOR, subject),
    analyticsConsent: false
});

/**
 * Cancel the order of a payment whose amount, currency or payment id did not match. The cancel's
 * own refund announcement returns the money (`performRefund` needs only a `succeeded` payment).
 * When the cancel is refused — the order moved on its own meanwhile — the money is put back
 * directly instead. A cancel that throws is logged and left to the reservation expiry, which
 * cancels the still-pending order and refunds the same way.
 *
 * @param orderId - the order to cancel
 */
const cancelMismatchedOrder = (orderId: string): Promise<void> =>
    orderService
        .cancelById(orderId, SYSTEM_ACTOR, {}, systemContext('Order'))
        .then((cancelled) => {
            if (cancelled.success) return undefined;
            return refundLostPayment(orderId).then(() => undefined);
        })
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: could not cancel order ${orderId} after a payment mismatch — the reservation expiry will, and refund it`,
                error
            });
            // Stryker restore all
        });

/**
 * A provider-reported success that is not the payment we froze. Records what arrived, cancels the
 * order and lets the existing refund path return the money: nothing is paid, no stock is
 * committed, no `payment.succeeded` is announced and no invoice is issued.
 *
 * The write is conditional, so exactly one of several racing calls reports and cancels; the others
 * only answer that the order is no longer payable.
 *
 * @param payment - the payment, as frozen at the intent
 * @param state - the provider's `succeeded`
 * @param fields - which of amount, currency and paymentId disagreed
 */
const settleMismatch = (
    payment: PaymentDocument,
    state: ProviderPaymentState,
    fields: readonly string[]
): Promise<Settlement> => {
    const orderId = String(payment.orderId);

    // What ARRIVED is written over the frozen figures, so the refund returns what was collected.
    return paymentRepository
        .updateStatusIfIn(orderId, SETTLEABLE_PAYMENT_STATUSES, 'succeeded', {
            ...(state.cardLast4 ? { cardLast4: state.cardLast4 } : {}),
            ...(state.amountReceived === undefined ? {} : { amount: state.amountReceived }),
            ...(state.currency ? { currency: state.currency } : {})
        })
        .then(async (recorded) => {
            if (!recorded) return { payment, orderLost: true, transitioned: false };

            for (const field of fields) paymentAmountMismatchTotal.inc({ field });
            // Stryker disable all
            logger.error({
                message: `Payments: the provider reported a success for order ${orderId} that is not the payment frozen for it — order cancelled, money to be returned`,
                paymentId: String(payment._id),
                fields,
                expected: { amount: payment.amount, currency: payment.currency },
                received: {
                    amount: state.amountReceived,
                    currency: state.currency,
                    paymentId: state.paymentId
                }
            });
            // Stryker restore all
            recordAudit(systemContext('Payment'), {
                action: paymentsAuditActions.PAYMENT_AMOUNT_MISMATCH,
                outcome: 'failure',
                targetType: 'payment',
                targetId: String(payment._id),
                metadata: {
                    order_id: orderId,
                    fields,
                    expected: { amount: payment.amount, currency: payment.currency },
                    received: {
                        amount: state.amountReceived,
                        currency: state.currency,
                        payment_id: state.paymentId
                    }
                }
            });

            await cancelMismatchedOrder(orderId);
            const current = await paymentRepository.findByOrderId(orderId);
            return { payment: current ?? recorded, orderLost: true, transitioned: true };
        });
};

/** What the settlement transaction decided, for what must happen once it has committed. */
type SettlementOutcome =
    | { kind: 'replay'; payment: null }
    | { kind: 'paid' | 'lost'; payment: PaymentDocument };

/**
 * The success branch's one atomic step: the payment's `succeeded` write, the order's `paid` move
 * (which also commits the stock hold), their timeline rows and outbox rows — or, when the order
 * can no longer be paid, the `succeeded` write and an open refund record for the whole amount.
 * Everything commits together or nothing does.
 *
 * Database only: no provider call, no mail. The driver re-runs this callback on a transient
 * error, so anything else would happen twice.
 *
 * Gate:    the PAYMENT write. `SETTLEABLE_PAYMENT_STATUSES` excludes the terminal states, so
 *          exactly one caller sees its own write land; a webhook and a confirm racing each other
 *          commit once. The other finds nothing to do — `replay`.
 * Replay:  `markPaid` answering `null` on an order that is already past payment (a move that
 *          landed some other way) still commits the hold and announces; nothing is lost.
 * Lost:    the order was cancelled (or otherwise left `pending`) before the money arrived. The
 *          refund record is opened here, so the money is never durable without its way back; the
 *          provider call happens after the commit.
 *
 * @param payment - the payment, as frozen at the intent
 * @param extra - what the provider reported beside the status, written with it
 * @param paid - how the order is told it was paid: `paidBy` is `card` when the provider took the
 *   money, `actor` the staff member who recorded it by hand
 * @param session - the settlement's transaction
 */
const settleWithin = async (
    payment: PaymentDocument,
    extra: Partial<PaymentDocument>,
    paid: { paidBy: 'card' | undefined; actor: string | null | undefined },
    session: ClientSession
): Promise<SettlementOutcome> => {
    const orderId = String(payment.orderId);
    const succeeded = await paymentRepository.updateStatusIfIn(
        orderId,
        SETTLEABLE_PAYMENT_STATUSES,
        'succeeded',
        extra,
        session
    );
    if (!succeeded) return { kind: 'replay', payment: null };

    const moved = await orderService.markPaid(
        orderId,
        paid.paidBy,
        { actor: paid.actor, method: payment.method },
        session
    );
    if (!moved) {
        // The write matched nothing: either the order is already past payment, or it is gone.
        const current = await orderService.getById(orderId);
        if (!current || !paymentSettled(current.status)) {
            await openRefund(succeeded, CANCELLATION_REQUEST, undefined, session);
            return { kind: 'lost', payment: succeeded };
        }
        await inventoryService.commitForOrder(orderId, session);
    }

    await enqueueOutboxEvent(
        PAYMENT_SUCCEEDED,
        { paymentId: String(succeeded._id), orderId },
        orderId,
        session
    );
    return { kind: 'paid', payment: succeeded };
};

/**
 * The mail that answers "did my card go through" — `orderConfirmEmail` at checkout only ever said
 * the order was received. Fire-and-forget: a slow mail send must not hold up the settlement's
 * caller, and one that fails must never undo money that landed.
 *
 * @param orderId - the order that was paid
 */
const mailPaymentSucceeded = (orderId: string): void => {
    void orderService
        .getById(orderId)
        .then((order) => {
            if (!order) return;
            void mailBuyer(order, (locale, name) => {
                const mail = paymentSucceededEmail(locale, name, order, orderId);
                void enqueueEmail(
                    { to: order.email, subject: mail.subject },
                    mail.template,
                    mail.data
                );
            });
        })
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: could not read order ${orderId} to mail its payment confirmation`,
                error
            });
            // Stryker restore all
        });
};

/**
 * What only a committed settlement allows: wake the outbox relay, bring the catalogue's stock
 * cache into step (a preorder may have been served), and for money that arrived too late, ask
 * the provider to return it. A failed refund is logged and left to `retryOpenRefunds`: the open
 * record is already durable.
 *
 * @param payment - the payment as the caller read it, for the answer when nothing was written
 * @param outcome - what the transaction decided
 */
const afterSettlement = (
    payment: PaymentDocument,
    outcome: SettlementOutcome
): Promise<Settlement> => {
    const orderId = String(payment.orderId);

    if (outcome.kind === 'replay')
        // Whoever won already did the rest. The answer is the payment as they left it, never the
        // pre-read this call holds: that copy still says `requires_confirmation`.
        return paymentRepository.findByOrderId(orderId).then((current) => ({
            payment: current ?? payment,
            orderLost: false,
            transitioned: false
        }));

    nudgeOutbox();

    if (outcome.kind === 'lost')
        return performRefund(orderId)
            .catch((error: unknown) => {
                // Stryker disable all
                logger.error({
                    message: `Payments: could not refund order ${orderId} after its payment landed on an order no longer payable — left for the retry sweep`,
                    error
                });
                // Stryker restore all
                return null;
            })
            .then((refunded) => ({
                payment: refunded ?? outcome.payment,
                orderLost: true,
                transitioned: true
            }));

    mailPaymentSucceeded(orderId);
    return inventoryService
        .refreshStockCacheForOrder(orderId)
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: could not refresh the stock cache for order ${orderId} after its payment settled`,
                error
            });
            // Stryker restore all
        })
        .then(() => ({ payment: outcome.payment, orderLost: false, transitioned: true }));
};

/**
 * Apply what the provider says about a payment. **The one place money is reconciled**, reached
 * from the webhook, from the confirm, and from the sync — see the module docblock for why there is
 * only one.
 *
 * Every write is conditional, so a delivery that arrives twice, or races the browser's own call,
 * settles once. The PAYMENT write is what gates it — `SETTLEABLE_PAYMENT_STATUSES` excludes the
 * terminal states, so exactly one caller ever sees its own write succeed — not the order's own
 * `pending → paid` move: a webhook retried after {@link applyWebhookDelivery} released its claim
 * re-enters here and can legitimately lose that race (the order already got there on the failed
 * first attempt) while still being the one call that must finish the job.
 *
 * @param payment - the payment the provider named
 * @param state - what the provider reported
 * @param newAttempt - `true` when the caller is itself a fresh attempt at paying (a confirm), so
 *   a decline of an already-declined payment is a new decline and not a repeat report of one
 * @param actor - the staff member who recorded the money by hand, for the order's timeline; absent
 *   when a provider reported it
 */
export const settlePayment = (
    payment: PaymentDocument,
    state: ProviderPaymentState,
    newAttempt = false,
    actor?: string | null
): Promise<Settlement> => {
    const orderId = String(payment.orderId);
    const extra = state.cardLast4 ? { cardLast4: state.cardLast4 } : {};

    // Nothing has landed yet: record where the payment got to and stop. Both of these are states
    // the browser has more work to do in, and neither may touch the order.
    if (state.status !== 'succeeded' && state.status !== 'declined')
        return paymentRepository
            .updateStatusIfIn(orderId, SETTLEABLE_PAYMENT_STATUSES, state.status, extra)
            .then(async (updated) => {
                /*
                 * `processing` means the PROVIDER still has work to do — a SEPA debit, some bank
                 * redirects — which can take days, so the hold gets the bank-transfer window
                 * instead of the ordinary 30 minutes. `requires_action`
                 * gets no such grace: that means the BROWSER has work to do, and the ordinary
                 * window already fits it. Only on THIS call's own write, and never allowed to
                 * fail the settlement response it stands beside.
                 */
                if (updated && state.status === 'processing')
                    await inventoryService
                        .extendHoldForOrder(orderId, bankTransferHoldHours())
                        .catch((error: unknown) => {
                            // Stryker disable all
                            logger.error({
                                message: `Payments: could not extend the hold for order ${orderId} while its payment settles`,
                                error
                            });
                            // Stryker restore all
                        });
                return {
                    payment: updated ?? payment,
                    orderLost: false,
                    transitioned: updated !== null
                };
            });

    if (state.status === 'declined')
        return recordDecline(orderId, extra, newAttempt).then((updated) => ({
            payment: updated ?? payment,
            orderLost: false,
            transitioned: updated !== null
        }));

    // The money must be the money we asked for, checked before anything is paid. A hand-recorded
    // payment (`manual`) has no provider reporting figures: its amount IS the order's own.
    const mismatched = payment.provider === 'manual' ? [] : receiptMismatch(payment, state);
    if (mismatched.length > 0) return settleMismatch(payment, state, mismatched);

    // A card settling the order is how it was paid, whatever checkout chose: the order page shows
    // its payment method beside "Paid, card ending …", and the two must agree.
    const paidBy = payment.method === 'card' ? 'card' : undefined;
    return withTransaction((session) =>
        settleWithin(payment, extra, { paidBy, actor }, session)
    ).then((outcome) => afterSettlement(payment, outcome));
};

/**
 * Turn a settled payment into the answer its HTTP caller is owed.
 *
 * Shared by the confirm and the sync, which differ in how they reach the provider and in nothing
 * after it; exported so `./offline`'s own settlement call can reuse the `orderLost` refusal
 * rather than rebuild it.
 */
export const settlementResponse = ({
    payment,
    orderLost
}: Settlement): ResponseSuccess<PaymentDocument> | ResponseReject => {
    if (orderLost) return notPayable();

    if (payment.status === 'declined')
        return generateReject(409, [
            { code: ERROR_CODES.PAYMENT_DECLINED, message: t('payments.declined') }
        ]);

    // In flight is a success on the wire, not a refusal: the browser has a next step to take and
    // a 4xx would tell it to stop. The message says which of the two it is looking at.
    if (payment.status !== 'succeeded')
        return generateSuccess(payment, 200, t(`payments.${payment.status}`));

    return generateSuccess(payment, 200, t('payments.confirm-success'));
};

/**
 * Report a confirm or sync attempt, once its answer is known and only when this call's own write
 * made it so.
 *
 * Only these two outcomes are events: `PAYMENT_DECLINED` is a method the provider refused,
 * reportable like any other attempt. The other rejections (payment not found, not in a confirmable
 * state, the order gone) are request-shape or race problems, not a fact about the money — nothing
 * there to attribute to a card. An in-flight answer is not an outcome yet, so it is not one either.
 * A call that did not move the payment (it lost a race, or polled something already settled)
 * reports nothing: the call that did already did.
 *
 * @param settlement - what the settlement did
 * @param result - the HTTP answer the settlement turned into
 * @param paymentId - the payment, for the audit and analytics properties
 * @param context - the caller the attempt is attributed to
 */
const reportAttempt = (
    settlement: Settlement,
    result: ResponseSuccess<PaymentDocument> | ResponseReject,
    paymentId: string,
    context: CallerContext
): ResponseSuccess<PaymentDocument> | ResponseReject => {
    if (!settlement.transitioned) return result;
    const declined =
        !result.success && result.errors.some(({ code }) => code === 'PAYMENT_DECLINED');
    const settled = result.success && result.data.status === 'succeeded';
    if (!settled && !declined) return result;

    recordAudit(context, {
        action: settled
            ? paymentsAuditActions.PAYMENT_CONFIRMED
            : paymentsAuditActions.PAYMENT_FAILED,
        outcome: settled ? 'success' : 'failure',
        metadata: { payment_id: paymentId }
    });
    emitAnalyticsEvent({
        ...buildAnalyticsBase(context),
        event: settled
            ? paymentsAnalyticsEvents.PAYMENT_SUCCEEDED
            : paymentsAnalyticsEvents.PAYMENT_DECLINED,
        properties: { payment_id: paymentId }
    });
    return result;
};

/**
 * Whether an already-fetched payment is in one of the given states, or say which refusal it was —
 * the check both browser-driven endpoints share, over a document each has already read for its own
 * reasons (a fresh read for the confirm, one the sync needed anyway to know it isn't terminal).
 *
 * @returns the payment, narrowed to prove it carries a `providerRef` — nothing here reaches a
 *   confirmable or settleable status before the provider was asked for an intent — or the refusal
 */
const findConfirmable = (
    payment: PaymentDocument,
    allowed: readonly PaymentStatus[]
): (PaymentDocument & { providerRef: string }) | ResponseReject => {
    // No reference means the provider was never asked for an intent, so there is nothing at
    // the far end to confirm or re-read. Same refusal as a wrong status: the client's move is
    // to create the intent again either way.
    if (!payment.providerRef || !allowed.includes(payment.status))
        return generateReject(409, [
            { code: ERROR_CODES.PAYMENT_NOT_CONFIRMABLE, message: t('payments.not-confirmable') }
        ]);
    // The guard above proves `providerRef` is present, but narrowing a property does not narrow
    // the object it lives on — TS has no way to fold that back into `payment`'s own type here.
    return payment as PaymentDocument & { providerRef: string };
};

/**
 * Whether an order can still be charged into — the gate {@link confirmPayment} checks before
 * reaching the provider, so a cancelled order is refused up front instead of charged then
 * refunded, which loses the provider's fee on the refund (A1). `syncPayment` has no need for this:
 * `retrieve` only re-reads what the provider already decided, it never asks it to take money.
 *
 * @param orderId - the order the payment being confirmed belongs to
 * @returns the refusal when the order can no longer be paid, or its stock is not held for it;
 *   `null` to let the confirm proceed
 */
const confirmableOrder = (orderId: string): Promise<ResponseReject | null> =>
    orderService
        .getById(orderId)
        .then((order) =>
            order && isPayable(order.status)
                ? // Money is taken only for units set aside: a hold already released (an expiry whose
                  // cancellation has not landed yet) means the shelf may be gone.
                  inventoryService.isHoldReleased(orderId).then((released) => !released)
                : false
        )
        .then((payable) => (payable ? null : notPayable()));

/**
 * Settle an already-fetched, already-scoped payment via the provider, gated on it currently
 * sitting in one of `allowed` — the part {@link confirmPayment} and {@link syncPayment} do
 * identically once each has decided the call may proceed at all. Split from {@link settleVia} so
 * {@link syncPayment}'s own idempotent-terminal shortcut can run on the SAME read rather than a
 * second one.
 * @param payment - the payment, already read for this caller
 * @param allowed - the statuses this action may run from
 * @param providerCall - the provider-specific action (confirm or re-read), given the payment
 *   itself — narrowed to prove `providerRef` is present — so it can reach the provider named on
 *   THIS payment rather than the deployment's currently configured one
 * @param context - the caller the attempt is reported against
 * @param options - `precheck` is an extra async gate run before `providerCall`, for a refusal
 *   that needs a read `findConfirmable`'s own synchronous check cannot make — {@link confirmPayment}'s
 *   only, today; `newAttempt` marks the caller as itself an attempt at paying (see
 *   {@link settlePayment})
 */
const settleFound = (
    payment: PaymentDocument,
    allowed: readonly PaymentStatus[],
    providerCall: (
        payment: PaymentDocument & { providerRef: string }
    ) => Promise<ProviderPaymentState>,
    context: CallerContext,
    options: {
        precheck?: (
            payment: PaymentDocument & { providerRef: string }
        ) => Promise<ResponseReject | null>;
        newAttempt?: boolean;
    } = {}
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> => {
    const found = findConfirmable(payment, allowed);
    if ('success' in found) return Promise.resolve(found);
    const { precheck, newAttempt = false } = options;
    return (precheck ? precheck(found) : Promise.resolve(null)).then((refusal) => {
        if (refusal) return refusal;
        return providerCall(found)
            .then((state) => settlePayment(found, state, newAttempt))
            .then((settlement) =>
                reportAttempt(
                    settlement,
                    settlementResponse(settlement),
                    String(found._id),
                    context
                )
            );
    });
};

/**
 * Settle one payment via the provider — {@link confirmPayment}'s whole body: read the payment
 * scoped to its caller, refuse a status this action does not run from, hand the provider's own
 * account of it to {@link settlePayment}, and audit/analyse the outcome.
 * @param paymentId - the payment to settle
 * @param authContext - the caller; the payment must be theirs
 * @param context - the caller context to audit/analyse the attempt against
 * @param allowed - the statuses this action may run from
 * @param providerCall - the provider-specific action (confirm or re-read) — see {@link settleFound}
 * @param precheck - see {@link settleFound}
 */
const settleVia = (
    paymentId: string,
    authContext: AuthContext | undefined,
    context: CallerContext,
    allowed: readonly PaymentStatus[],
    providerCall: (
        payment: PaymentDocument & { providerRef: string }
    ) => Promise<ProviderPaymentState>,
    precheck?: (
        payment: PaymentDocument & { providerRef: string }
    ) => Promise<ResponseReject | null>
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
    paymentRepository.findByIdScoped(paymentId, payerScope(authContext)).then((payment) => {
        if (!payment) return generateReject(404, [t('payments.not-found')]);
        // Confirming IS an attempt at paying, so a decline here is a new one even when the
        // payment is already `declined` from the card before.
        return settleFound(payment, allowed, providerCall, context, {
            precheck,
            newAttempt: true
        });
    });

/**
 * Confirm a payment — the browser handing over the method its provider widget tokenised.
 *
 * The answer is not always final. A card the bank wants a challenge for comes back
 * `requires_action` and one that settles over days `processing`; both are successes on the wire,
 * and {@link syncPayment} is what resolves them once the browser is done.
 *
 * Refuses before ever reaching the provider (A1) when the order can no longer be paid into — a
 * cancel that raced the confirm otherwise still takes the card's money, only to refund it right
 * back and lose the provider's own fee on that refund.
 *
 * @param paymentId - the intent being confirmed
 * @param paymentMethodRef - the provider's opaque handle for the method. NOT a card number
 * @param authContext - the caller; the payment must be theirs
 */
export const confirmPayment = (
    paymentId: string,
    paymentMethodRef: string,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
    settleVia(
        paymentId,
        authContext,
        context,
        CONFIRMABLE_PAYMENT_STATUSES,
        (payment) => providerNamed(payment.provider).confirm(payment.providerRef, paymentMethodRef),
        (payment) => confirmableOrder(String(payment.orderId))
    );

/**
 * Re-read a payment from the provider and apply whatever it says — the browser reporting that it
 * has finished a challenge, and the reconciliation path for anything the webhook never delivered.
 *
 * Idempotent by construction: a payment already settled is answered as it stands, without asking
 * the provider anything.
 *
 * @param paymentId - the payment to re-read
 * @param authContext - the caller; the payment must be theirs
 */
export const syncPayment = (
    paymentId: string,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
    paymentRepository.findByIdScoped(paymentId, payerScope(authContext)).then((payment) => {
        if (!payment) return generateReject(404, [t('payments.not-found')]);
        // Terminal already: there is nothing the provider could say that this module would
        // act on, and asking would spend a call to be told so.
        if (!SETTLEABLE_PAYMENT_STATUSES.includes(payment.status))
            return generateSuccess(payment, 200);

        return settleFound(
            payment,
            SETTLEABLE_PAYMENT_STATUSES,
            (found) => providerNamed(found.provider).retrieve(found.providerRef),
            context
        );
    });

/**
 * Apply a webhook delivery the provider has already been authenticated for.
 *
 * The delivery names an intent and nothing else is believed from it: the payment's state is
 * re-read from the provider (`retrieve`) and THAT is settled. A provider does not promise delivery
 * order, so a body that said `succeeded` after a later `declined` would otherwise un-decline a
 * payment; asking costs one provider call per accepted event.
 *
 * No ledger of seen event ids: a redelivery re-reads the provider and settles again, and every
 * effect is gated by a conditional write (the payment's own `succeeded` write is the gate, in one
 * transaction with the order and the hold), so a repeat settles once. A settlement that fails
 * rejects, the provider redelivers, and the redelivery is the retry.
 *
 * Deliberately quiet — it answers nothing to anyone, so an event this application cannot act on is
 * logged and dropped rather than raised. A provider reads any non-2xx as a failed delivery and
 * comes back harder, and there is nothing here a retry would fix.
 *
 * @param event - the delivery, already verified and normalised by the provider
 */
export const applyWebhookDelivery = (event: ProviderWebhookEvent): Promise<void> => {
    if (!event.providerRef) {
        // Stryker disable all
        logger.info({
            message: 'Payment webhook named no intent to apply.',
            eventId: event.id
        });
        // Stryker restore all
        return Promise.resolve();
    }

    // Stryker disable all
    logger.info({
        message: 'Payment webhook received.',
        eventId: event.id,
        providerRef: event.providerRef
    });
    // Stryker restore all
    return applyWebhookSettlement(event.providerRef);
};

/**
 * Ask the provider what became of a payment and settle the answer — the step the webhook, the
 * reconciliation sweep and the cancel path's catch all share, so they cannot drift apart.
 *
 * A payment already past `SETTLEABLE_PAYMENT_STATUSES` is left alone without asking the provider
 * anything, the same shortcut {@link syncPayment} takes: nothing it could say would be acted on.
 *
 * @param payment - the payment to reconcile; it must hold a `providerRef`
 * @returns what the settlement did, or `null` when the payment was already settled and the
 *   provider was not asked
 */
export const settleFromProvider = (payment: PaymentDocument): Promise<Settlement | null> => {
    if (!SETTLEABLE_PAYMENT_STATUSES.includes(payment.status) || !payment.providerRef)
        return Promise.resolve(null);

    return providerNamed(payment.provider)
        .retrieve(payment.providerRef)
        .then((state) => settlePayment(payment, state));
};

/**
 * Settle one payment from what the PROVIDER says about it now: find the payment the intent names,
 * ask the provider that payment was made with (`retrieve`), settle the answer.
 *
 * Separate from {@link applyWebhookDelivery} because the tests that pin the SETTLEMENT should not
 * have to mint an event id to reach it, and because the reconciliation sweep
 * (`./effects.ts#reconcileStalePayments`) has no delivery either.
 *
 * Unattended, so outcomes are logged rather than audited — the same rule the cancel listener and
 * the token-cleanup job follow.
 *
 * @param providerRef - the intent the event named
 */
export const applyWebhookSettlement = (providerRef: string): Promise<void> =>
    paymentRepository.findByProviderRef(providerRef).then((payment) => {
        if (!payment) {
            // Stryker disable all
            logger.warn({
                message: 'Payment webhook named an intent this application does not know.',
                providerRef
            });
            // Stryker restore all
            return;
        }

        return settleFromProvider(payment).then((settlement) => {
            if (!settlement) return;
            // Stryker disable all
            logger.info({
                message: 'Payment webhook applied.',
                providerRef,
                status: settlement.payment.status,
                orderLost: settlement.orderLost
            });
            // Stryker restore all
        });
    });
