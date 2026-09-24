/**
 * @module
 * Reconciling what the provider says about a payment — the browser-driven confirm/sync and the
 * webhook delivery all funnel into {@link settlePayment}, the ONE place money is reconciled. Two
 * copies would drift, and drifted copies commit inventory twice.
 */

import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { emitDomainEvent } from '@kernel/events';
import { OrderStatus } from '@types';
import type { PaymentStatus, AuthContext } from '@types';
import { orderService } from '@modules/orders';
import { PAYMENT_SUCCEEDED, PAYMENT_FAILED } from '../events';
import { inventoryService } from '@modules/inventory';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { paymentsAnalyticsEvents } from '../analytics';
import { paymentsAuditActions } from '../audit';
import {
    resolvePaymentProvider,
    type ProviderPaymentState,
    type ProviderWebhookEvent
} from '../providers';
import { claimWebhookEvent, releaseWebhookEvent, paymentRepository } from '../repository';
import { CONFIRMABLE_PAYMENT_STATUSES } from '../model';
import type { PaymentDocument } from '../model';
import { callerScope } from './scope';
import { performRefund } from './refunds';
import { notPayable } from './errors';

/**
 * The statuses a settlement may move a payment away from — every non-terminal one. `succeeded` and
 * `refunded` are absent, which is what makes {@link settlePayment} at-most-once: a webhook retried
 * for three days finds nothing to move on its second delivery.
 */
const SETTLEABLE_PAYMENT_STATUSES: readonly PaymentStatus[] = [
    'requires_confirmation',
    'requires_action',
    'processing',
    'declined'
];

/** What a settlement did, for a caller that has to turn it into an HTTP answer. */
interface Settlement {
    /** The payment as it now stands. */
    payment: PaymentDocument;
    /**
     * Whether the money arrived at a moment when the order could no longer be paid. It was put
     * straight back, and the payment reads `refunded` — but the caller owes its client a refusal
     * rather than a success, which is the one thing the status alone does not say.
     */
    orderLost: boolean;
}

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
 */
export const settlePayment = (
    payment: PaymentDocument,
    state: ProviderPaymentState
): Promise<Settlement> => {
    const orderId = String(payment.orderId);
    const extra = state.cardLast4 ? { cardLast4: state.cardLast4 } : {};

    // Nothing has landed yet: record where the payment got to and stop. Both of these are states
    // the browser has more work to do in, and neither may touch the order.
    if (state.status !== 'succeeded' && state.status !== 'declined')
        return paymentRepository
            .updateStatusIfIn(orderId, SETTLEABLE_PAYMENT_STATUSES, state.status, extra)
            .then((updated) => ({ payment: updated ?? payment, orderLost: false }));

    if (state.status === 'declined')
        return paymentRepository
            .updateStatusIfIn(orderId, SETTLEABLE_PAYMENT_STATUSES, 'declined', extra)
            .then((updated) => {
                // Only when THIS call actually moved the write — a redelivered decline that lost
                // its race must not tell `webhooks` the attempt happened twice.
                if (updated)
                    void emitDomainEvent(PAYMENT_FAILED, {
                        paymentId: String(updated._id),
                        orderId
                    });
                return { payment: updated ?? payment, orderLost: false };
            });

    // The order's move IS the gate (module rule 2), and it is conditional, so exactly one of two
    // racing settlements gets past it. `markPaid` is `orders`' own conditional write — this
    // module reports the fact, it never writes the order's status itself. `markPaid` fires
    // `order.status_changed` (fire-and-forget) the moment the write lands, which is BEFORE
    // `commitForOrder` below runs — a subscriber reacting to the status move sees `paid` before
    // the reservation is actually committed. Safe today: `webhooks`, the one listener, forwards
    // only `{ orderId }`, carries no stock figure that ordering could make stale, and nothing else
    // in this application listens. Reorder the two (commit, then report) if a future listener
    // ever needs to read committed stock in reaction to this event.
    return orderService.markPaid(orderId).then(async () => {
        const succeeded = await paymentRepository.updateStatusIfIn(
            orderId,
            SETTLEABLE_PAYMENT_STATUSES,
            'succeeded',
            extra
        );

        // Neither write moved anything: an earlier call already settled this payment (both
        // writes are terminal-once-applied), or this delivery lost every race there was —
        // either way, whoever won already did (or is doing) the rest, or there is nothing to
        // do. Acting again here is exactly the double-commit / wrongful-refund this guards.
        if (!succeeded) return { payment, orderLost: false };

        // The order's CURRENT status, read after the payment write — never what `markPaid`
        // answered, which is a copy from before it. Between the two writes the customer may
        // cancel the order from `paid`, and that cancel's refund found nothing `succeeded` to
        // return yet: trusting the copy would keep the money for a cancelled order. The read
        // also covers `markPaid` answering null — another settlement raced this order to `paid`
        // (nothing lost), or it was already cancelled.
        const orderNow = await orderService.getById(orderId);
        const orderIsPaid = orderNow?.status === OrderStatus.paid;

        if (!orderIsPaid) {
            /*
             * The money moved but the order was gone (cancelled, or a racing tab won). Put it
             * straight back — the invariant is the module docblock's rule 2. `performRefund`
             * rather than a bare `provider.refund`, so the payment ends up saying `refunded`
             * and the at-most-once guard is the same one every other refund goes through.
             */
            const refunded = await performRefund(orderId);
            return { payment: refunded ?? succeeded, orderLost: true };
        }

        /*
         * The units finally leave — held since checkout, recoverable until now.
         *
         * Reached at most once per order: `succeeded` above is itself an at-most-once write
         * (terminal once applied), and this is the only call whose `succeeded` write can ever
         * be truthy — `markPaid`'s own race does not gate this: a redelivered event
         * can legitimately lose it while still being the one true settlement. The result is not
         * checked: `false` covers both a harmless replay (the hold is already `committed`) and
         * a hold an expiry sweep beat the payment to — the customer has a paid order either
         * way, and `inventory` tells the two apart and alarms only the second.
         */
        await inventoryService.commitForOrder(orderId);

        // Fire-and-forget, like `PAYMENT_FAILED` above: `webhooks` reacts to this from its own
        // `subscribe()` hook, and a slow or failing listener there must not delay the response
        // this settlement's callers (confirm, sync, the provider webhook) are already sending.
        void emitDomainEvent(PAYMENT_SUCCEEDED, { paymentId: String(succeeded._id), orderId });

        return { payment: succeeded, orderLost: false };
    });
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
        return generateReject(409, [{ code: 'PAYMENT_DECLINED', message: t('payments.declined') }]);

    // In flight is a success on the wire, not a refusal: the browser has a next step to take and
    // a 4xx would tell it to stop. The message says which of the two it is looking at.
    if (payment.status !== 'succeeded')
        return generateSuccess(payment, 200, t(`payments.${payment.status}`));

    return generateSuccess(payment, 200, t('payments.confirm-success'));
};

/**
 * Report a confirm or sync attempt, once its answer is known.
 *
 * Only these two outcomes are events: `PAYMENT_DECLINED` is a method the provider refused,
 * reportable like any other attempt. The other rejections (payment not found, not in a confirmable
 * state, the order gone) are request-shape or race problems, not a fact about the money — nothing
 * there to attribute to a card. An in-flight answer is not an outcome yet, so it is not one either.
 */
const reportAttempt = (
    result: ResponseSuccess<PaymentDocument> | ResponseReject,
    paymentId: string,
    context: CallerContext
): ResponseSuccess<PaymentDocument> | ResponseReject => {
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
            { code: 'PAYMENT_NOT_CONFIRMABLE', message: t('payments.not-confirmable') }
        ]);
    // The guard above proves `providerRef` is present, but narrowing a property does not narrow
    // the object it lives on — TS has no way to fold that back into `payment`'s own type here.
    return payment as PaymentDocument & { providerRef: string };
};

/**
 * Settle an already-fetched, already-scoped payment via the provider, gated on it currently
 * sitting in one of `allowed` — the part {@link confirmPayment} and {@link syncPayment} do
 * identically once each has decided the call may proceed at all. Split from {@link settleVia} so
 * {@link syncPayment}'s own idempotent-terminal shortcut can run on the SAME read rather than a
 * second one.
 * @param payment - the payment, already read for this caller
 * @param allowed - the statuses this action may run from
 * @param providerCall - the provider-specific action (confirm or re-read), given the payment's own
 *   `providerRef`
 */
const settleFound = (
    payment: PaymentDocument,
    allowed: readonly PaymentStatus[],
    providerCall: (providerRef: string) => Promise<ProviderPaymentState>
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> => {
    const found = findConfirmable(payment, allowed);
    if ('success' in found) return Promise.resolve(found);
    return providerCall(found.providerRef)
        .then((state) => settlePayment(found, state))
        .then(settlementResponse);
};

/**
 * Settle one payment via the provider — {@link confirmPayment}'s whole body: read the payment
 * scoped to its caller, refuse a status this action does not run from, hand the provider's own
 * account of it to {@link settlePayment}, and audit/analyse the outcome.
 * @param paymentId - the payment to settle
 * @param authContext - the caller; the payment must be theirs
 * @param context - the caller context to audit/analyse the attempt against
 * @param allowed - the statuses this action may run from
 * @param providerCall - the provider-specific action (confirm or re-read), given the payment's own
 *   `providerRef`
 */
const settleVia = (
    paymentId: string,
    authContext: AuthContext | undefined,
    context: CallerContext,
    allowed: readonly PaymentStatus[],
    providerCall: (providerRef: string) => Promise<ProviderPaymentState>
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
    paymentRepository
        .findByIdScoped(paymentId, callerScope(authContext))
        .then((payment) => {
            if (!payment) return generateReject(404, [t('payments.not-found')]);
            return settleFound(payment, allowed, providerCall);
        })
        .then((result) => reportAttempt(result, paymentId, context));

/**
 * Confirm a payment — the browser handing over the method its provider widget tokenised.
 *
 * The answer is not always final. A card the bank wants a challenge for comes back
 * `requires_action` and one that settles over days `processing`; both are successes on the wire,
 * and {@link syncPayment} is what resolves them once the browser is done.
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
    settleVia(paymentId, authContext, context, CONFIRMABLE_PAYMENT_STATUSES, (providerRef) =>
        resolvePaymentProvider().confirm(providerRef, paymentMethodRef)
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
    paymentRepository
        .findByIdScoped(paymentId, callerScope(authContext))
        .then((payment) => {
            if (!payment) return generateReject(404, [t('payments.not-found')]);
            // Terminal already: there is nothing the provider could say that this module would
            // act on, and asking would spend a call to be told so.
            if (!SETTLEABLE_PAYMENT_STATUSES.includes(payment.status))
                return generateSuccess(payment, 200);

            return settleFound(payment, SETTLEABLE_PAYMENT_STATUSES, (providerRef) =>
                resolvePaymentProvider().retrieve(providerRef)
            );
        })
        .then((result) => reportAttempt(result, paymentId, context));

/**
 * Apply a webhook delivery the provider has already been authenticated for.
 *
 * Claims the event id first, and stops if somebody already has it: the status writes below are
 * at-most-once by themselves, but committing inventory and emitting `ORDER_STATUS_CHANGED` are
 * not, and a provider retries a delivery for days. A settlement that then fails releases the claim
 * before the rejection leaves — the provider WILL redeliver, and that redelivery is the only thing
 * that can still pay this order. The residual: a process crash between the claim and the release
 * still strands the row, unreleased and unreachable by any future retry.
 *
 * Deliberately quiet — it answers nothing to anyone, so an event this application cannot act on is
 * logged and dropped rather than raised. A provider reads any non-2xx as a failed delivery and
 * comes back harder, and there is nothing here a retry would fix.
 *
 * @param event - the delivery, already verified and normalised by the provider
 */
export const applyWebhookDelivery = (event: ProviderWebhookEvent): Promise<void> =>
    claimWebhookEvent(event.id).then((claimed) => {
        // A retry of something already applied. Silent by design: a provider retrying is normal
        // traffic, not an incident.
        if (!claimed) return;

        if (!event.providerRef || !event.state) {
            // Stryker disable all
            logger.info({
                message: 'Payment webhook carried no state to apply.',
                eventId: event.id
            });
            // Stryker restore all
            return;
        }

        return applyWebhookSettlement(event.providerRef, event.state).catch((error: unknown) =>
            // The claim is what makes a retry a no-op, so a settlement that failed has to give it
            // back before the rejection leaves: the provider WILL redeliver, and that redelivery
            // is the only thing that can still pay this order.
            releaseWebhookEvent(event.id).then(() => {
                throw error;
            })
        );
    });

/**
 * Settle one payment from what the provider reported about it.
 *
 * Separate from {@link applyWebhookDelivery} because the tests that pin the SETTLEMENT should not
 * have to mint an event id to reach it, and because the reconciliation job that will eventually
 * sweep unsettled intents has an outcome but no delivery.
 *
 * Unattended, so outcomes are logged rather than audited — the same rule the cancel listener and
 * the token-cleanup job follow.
 *
 * @param providerRef - the intent the event named
 * @param state - what the provider reported about it
 */
export const applyWebhookSettlement = (
    providerRef: string,
    state: ProviderPaymentState
): Promise<void> =>
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

        return settlePayment(payment, state).then(({ payment: settled, orderLost }) => {
            // Stryker disable all
            logger.info({
                message: 'Payment webhook applied.',
                providerRef,
                reported: state.status,
                status: settled.status,
                orderLost
            });
            // Stryker restore all
        });
    });
