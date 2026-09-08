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
import { orderRepository, statusesLeadingTo, ORDER_STATUS_CHANGED } from '@modules/orders';
import { inventoryService } from '@modules/inventory';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { paymentsAnalyticsEvents } from '../analytics';
import { paymentsAuditActions } from '../audit';
import {
    resolvePaymentProvider,
    type ProviderPaymentState,
    type ProviderWebhookEvent
} from '../providers';
import { claimWebhookEvent, releaseWebhookEvent, paymentRepository } from '../repository';
import type { PaymentDocument } from '../model';
import { callerScope } from './scope';
import { performRefund } from './refunds';

/**
 * The payment statuses the confirm endpoint accepts. `declined` is here because a decline is
 * retryable with another method — the one place this lifecycle goes backwards. `requires_action`
 * and `processing` are NOT: a payment already in flight at the provider is resolved by re-reading
 * it ({@link syncPayment}), never by attaching a second method to it.
 *
 * An ARRAY, not a `Set`: this rule is read both as a membership test and as the `$in` of the
 * conditional writes that re-assert it while mongod holds the document, and a `Set` would need
 * re-spreading for the second.
 */
export const CONFIRMABLE_PAYMENT_STATUSES: readonly PaymentStatus[] = [
    'requires_confirmation',
    'declined'
];

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
            .then((updated) => ({ payment: updated ?? payment, orderLost: false }));

    // The order's move IS the gate (module rule 2), and it is conditional, so exactly one of two
    // racing settlements gets past it.
    return orderRepository
        .updateStatusIfIn(
            orderId,
            statusesLeadingTo(OrderStatus.paid, 'system'),
            OrderStatus.paid,
            {}
        )
        .then(async (paidOrder) => {
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

            // `paidOrder` is null in TWO different cases a redelivered event can now reach: this
            // order was raced to `paid` by another settlement of the same charge (nothing lost —
            // just not this call's doing), or it genuinely can no longer get there (cancelled). A
            // stale `paidOrder` is not enough to tell them apart; the order's CURRENT status is.
            const orderNow = paidOrder ?? (await orderRepository.findById(orderId));
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
             * be truthy — `paidOrder`'s own race no longer gates this, since a redelivered event
             * can legitimately lose it while still being the one true settlement. The result is
             * not checked: `false` means an expiry sweep beat the payment to the hold, which this
             * module cannot fix and `inventory` logs — the customer has a paid order either way.
             */
            await inventoryService.commitForOrder(orderId);

            await emitDomainEvent(ORDER_STATUS_CHANGED, {
                orderId,
                from: 'pending',
                to: 'paid'
            });

            return { payment: succeeded, orderLost: false };
        });
};

/**
 * Turn a settled payment into the answer its HTTP caller is owed.
 *
 * Shared by the confirm and the sync, which differ in how they reach the provider and in nothing
 * after it.
 */
const settlementResponse = ({
    payment,
    orderLost
}: Settlement): ResponseSuccess<PaymentDocument> | ResponseReject => {
    if (orderLost)
        return generateReject(409, [
            { code: 'PAYMENT_ORDER_NOT_PAYABLE', message: t('payments.order-not-payable') }
        ]);

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
    const settled = result.success && result.data?.status === 'succeeded';
    if (!settled && !declined) return result;

    emitAuditEvent(
        buildAuditEvent(context, {
            action: settled
                ? paymentsAuditActions.PAYMENT_CONFIRMED
                : paymentsAuditActions.PAYMENT_FAILED,
            outcome: settled ? 'success' : 'failure',
            metadata: { payment_id: paymentId }
        })
    );
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
    paymentRepository
        .findByIdScoped(paymentId, callerScope(authContext))
        .then((payment) => {
            if (!payment) return generateReject(404, [t('payments.not-found')]);
            const found = findConfirmable(payment, CONFIRMABLE_PAYMENT_STATUSES);
            if ('success' in found) return found;
            return resolvePaymentProvider()
                .confirm(found.providerRef, paymentMethodRef)
                .then((state) => settlePayment(found, state))
                .then(settlementResponse);
        })
        .then((result) => reportAttempt(result, paymentId, context));

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

            const found = findConfirmable(payment, SETTLEABLE_PAYMENT_STATUSES);
            if ('success' in found) return found;
            return resolvePaymentProvider()
                .retrieve(found.providerRef)
                .then((state) => settlePayment(found, state))
                .then(settlementResponse);
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
            logger.info({
                message: 'Payment webhook carried no state to apply.',
                eventId: event.id
            });
            return;
        }

        return applyWebhookSettlement(event.providerRef, event.state).catch((error: Error) =>
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
            logger.warn({
                message: 'Payment webhook named an intent this application does not know.',
                providerRef
            });
            return;
        }

        return settlePayment(payment, state).then(({ payment: settled, orderLost }) => {
            logger.info({
                message: 'Payment webhook applied.',
                providerRef,
                reported: state.status,
                status: settled.status,
                orderLost
            });
        });
    });
