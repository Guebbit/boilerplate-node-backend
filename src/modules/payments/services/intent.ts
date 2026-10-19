/**
 * @module
 * Creating (or refreshing) the payment intent for an order — the entry point into this module's
 * money-moving flow. See `./index`'s module docblock for the four rules every file here follows.
 */

import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { Payment, AuthContext } from '@types';
import { buyerIdOf, orderService, orderTotal, isPayable } from '@modules/orders';
import {
    resolvePaymentProvider,
    providerNamed,
    PaymentInFlightError,
    type PaymentProvider
} from '../providers';
import type { PaymentDocument } from '../model';
import { presentPayment } from '../presenter';
import { paymentRepository } from '../repository';
import { cardNotAvailable, notPayable, orderNotFound } from './errors';
import { mailTransferExpired } from './notify';
import { isHandRecorded, SETTLEABLE_PAYMENT_STATUSES } from '../domain';
import { settleFromProvider } from './settlement';
import { buyerOrderScope } from './scope';
import { ERROR_CODES } from '@api/error-codes';

/**
 * Refuse an intent the provider opened although the payment already held one: cancel the stray so
 * nothing is left open that the customer could pay, log it, and answer 409.
 *
 * Never rejects: the refusal is already the right answer, and a failed cancel is only logged.
 *
 * @param provider - the provider that opened the stray intent
 * @param strayRef - the reference it returned, which this payment row does not hold
 * @param orderId - the order being paid
 * @returns the 409 envelope
 */
const rejectStrayIntent = (
    provider: PaymentProvider,
    strayRef: string,
    orderId: string
): Promise<ResponseReject> =>
    provider
        .cancel(strayRef, { reason: 'duplicate intent for a payment that already holds one' })
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: could not cancel the stray intent ${strayRef} for order ${orderId}`,
                error
            });
            // Stryker restore all
        })
        .then(() => {
            // Stryker disable all
            logger.error({
                message: `Payments: the provider opened intent ${strayRef} for order ${orderId}, which already holds another — refused`
            });
            // Stryker restore all
            return generateReject(409, [
                {
                    code: ERROR_CODES.PAYMENT_IN_FLIGHT,
                    message: t('payments.intent-conflict')
                }
            ]);
        });

/**
 * Create (or refresh) the payment intent for an order.
 *
 * The amount is frozen here through `orderTotal` — the same function the order's serializer and
 * the confirmation email call, so the intent cannot ask for a different number than the order
 * shows. Lines alone is not that number: shipping is frozen on the order at checkout and the
 * contract counts it in `totalPrice`. The order's own frozen `currency` is the SAME one it was
 * priced in, so a provider charging in JPY never sees a EUR-shaped amount for a currency change made after the order was
 * placed. Re-asking is the double-click case: it refreshes and answers the same intent, 200 where
 * the first ask was 201; an order whose money already moved answers 409.
 *
 * A payment that already holds an intent resumes it: the stored reference goes to the provider, and
 * a different reference back is refused (409 `PAYMENT_IN_FLIGHT`) — a second intent for the same
 * order is a second thing the customer could pay.
 *
 * @param orderId - the order to pay
 * @param authContext - the caller; the order must be theirs — paying is the buyer's step, so an
 *   operator's wider read scope does not reach it
 * @returns the payment on the wire, carrying the `clientSecret` the browser finishes against —
 *   the one response that does, since it is never stored and never read back
 */
// Flat `await`s, not a nested `.then()` pyramid, for the same reason `@modules/orders`'
// `crud.ts#create` uses them: each step below depends on the last one's resolved value.
export const createIntent = async (
    orderId: string,
    authContext?: AuthContext
): Promise<ResponseSuccess<Payment> | ResponseReject> => {
    const order = await orderService.getById(orderId, buyerOrderScope(authContext));
    if (!order) return orderNotFound();
    // Payable is asked of the order lifecycle rather than compared against a literal here, so
    // this module cannot drift from the owner of the rule — and, unlike a bare `canTransition`
    // check, correctly refuses a second intent on an order that is already `paid`.
    if (!isPayable(order.status)) return notPayable();

    // No provider configured: this deployment takes no card payments, and the order stays unpaid.
    const provider = resolvePaymentProvider();
    if (!provider) return cardNotAvailable();
    const payerId = buyerIdOf(order);
    const { currency } = order;
    const upserted = await paymentRepository.upsertIntent(orderId, payerId, {
        // Explicit fields, not `{ ...order, currency }` — `order` is a hydrated Mongoose
        // document; spreading it copies nothing, since its schema paths are prototype getters,
        // not the document's own enumerable properties.
        amount: orderTotal(order),
        currency,
        provider: provider.name
    });
    if (!upserted) return notPayable();
    const { payment, created } = upserted;

    // The stored reference, when there is one, asks the provider to resume that intent.
    const { providerRef, clientSecret } = await provider.prepare(
        { amount: payment.amount, currency: payment.currency },
        { orderId, paymentId: String(payment._id) },
        payment.providerRef
    );
    // Backstop for an adapter that opened a new intent instead of resuming: the row keeps the
    // first, so the browser must not be handed the second's secret. The stray is cancelled.
    if (payment.providerRef && providerRef !== payment.providerRef)
        return rejectStrayIntent(provider, providerRef, orderId);
    const stored = await paymentRepository.attachProviderRef(String(payment._id), providerRef);
    // The same backstop for two first-time asks racing: both prepared an intent, the conditional
    // attach kept the first writer's reference, so this call's own is the stray.
    if (stored && stored.providerRef !== providerRef)
        return rejectStrayIntent(provider, providerRef, orderId);
    const prepared = {
        ...presentPayment(stored ?? payment),
        clientSecret
    };

    // 201 says a payment row was inserted; asking again refreshes the same one and creates nothing.
    return generateSuccess(prepared, created ? 201 : 200);
};

/**
 * Ask the provider to close a payment's own intent, if it has one open there — the counterpart to
 * {@link createIntent}. Nothing to close (no reference yet, or paid by hand — `manual` has no
 * provider to ask) answers success outright, the same as the provider's own "already cancelled".
 *
 * @param payment - the payment whose intent may need closing
 * @param reason - recorded at the provider, for support and reconciliation
 * @throws {PaymentInFlightError} when the provider says the intent already succeeded or is still
 *   mid-flight — there is money to refund instead, not an intent left to cancel
 */
export const cancelOpenIntent = (payment: PaymentDocument, reason: string): Promise<void> => {
    if (!payment.providerRef || isHandRecorded(payment)) return Promise.resolve();
    return providerNamed(payment.provider).cancel(payment.providerRef, { reason });
};

/**
 * `order.cancelled`'s listener (see `../module.ts`): close a still-open, never-settled intent at
 * the provider once its order is gone, so an abandoned one cannot resolve on its own later with no
 * local row left to catch it, then record it `cancelled`. A `succeeded` or already `cancelled`
 * payment is skipped outright — money is the refund half of the same `order.cancelled` listener
 * to give back, not this one's to cancel.
 *
 * Best-effort, unlike {@link cancelOpenIntent}'s other caller (`recordOfflinePayment`): the order
 * is already cancelled by the time this runs, so there is no request left here to refuse — a
 * provider failure is only logged, never rethrown, so it cannot stop the cancel that already
 * happened. A provider that says the intent already succeeded is the one case acted on: the
 * payment is reconciled on the spot, which refunds money that landed on the cancelled order.
 * `cancelled` is written only once the provider confirmed the close, and only from a still-open
 * status, so a success racing this call wins.
 *
 * A bank transfer's row (no provider behind it) is closed the same way, and when the cancel was
 * the hold running out, the buyer is told no transfer arrived — by the call whose write moved it.
 *
 * @param orderId - the order that was cancelled
 * @param expired - whether the cancel was the stock hold running out unpaid
 * @internal Closes any order's open intent with no caller to check: only this module's `subscribe`
 *   may run it, so it is not on `paymentService`.
 */
export const cancelOpenIntentForOrder = (orderId: string, expired = false): Promise<void> =>
    paymentRepository.findByOrderId(orderId).then((payment) => {
        if (!payment || !SETTLEABLE_PAYMENT_STATUSES.includes(payment.status)) return undefined;

        return cancelOpenIntent(payment, 'Order cancelled')
            .then(() =>
                paymentRepository.updateStatusIfIn(
                    orderId,
                    SETTLEABLE_PAYMENT_STATUSES,
                    'cancelled'
                )
            )
            .then((moved) =>
                moved?.transferReference && expired ? mailTransferExpired(orderId) : undefined
            )
            .catch((error: unknown) => {
                if (!(error instanceof PaymentInFlightError)) throw error;
                // The provider refused to close the intent: the customer's money landed (or is on
                // its way) in the last minutes before this cancel. Settling what the provider now
                // says finds the order gone and puts the money straight back; still mid-flight,
                // the reconciliation sweep finishes it once the provider has decided.
                return settleFromProvider(payment).then(() => undefined);
            })
            .catch((error: unknown) => {
                // Stryker disable all
                logger.error({
                    message: `Payments: could not close order ${orderId}'s open intent at the provider — left as it is; the reconciliation sweep asks the provider about it again`,
                    error
                });
                // Stryker restore all
            });
    });
