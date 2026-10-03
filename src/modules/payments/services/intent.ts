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
import {
    orderService,
    orderTotal,
    isPayable,
    unavailableLines,
    orderCurrency
} from '@modules/orders';
import { userService } from '@modules/users';
import { resolvePaymentProvider, providerNamed } from '../providers';
import type { PaymentDocument } from '../model';
import { presentPayment } from '../presenter';
import { paymentRepository } from '../repository';
import { notPayable } from './errors';
import { ERROR_CODES } from '@api/error-codes';

/**
 * Who is paying, resolved against `users` rather than copied off the order — a payment history
 * wants an id that pointed at a real account when the money moved, not the order's stale copy.
 * An unresolvable payer does NOT refuse the payment: orders survive account deletion, so the
 * order's id is kept and the gap logged.
 *
 * `orderUserId` is `undefined` for an order whose account has already been detached (erased) —
 * a live admin intent against a long-erased order's own account is gone, not merely
 * unresolvable, so there is nothing to look up or fall back to.
 *
 * @param orderUserId - the account id the order carries, or `undefined` once detached
 * @returns the id to persist on the payment, or `undefined` to persist none
 */
export const resolvePayerId = (orderUserId: string | undefined): Promise<string | undefined> => {
    if (orderUserId === undefined) return Promise.resolve(undefined);

    return userService
        .getById(orderUserId)
        .then((user) => {
            if (user) return user.id;
            // Stryker disable all
            logger.warn(
                `Payment intent for a user that no longer resolves (${orderUserId}) — recording the order's id unverified`
            );
            // Stryker restore all
            return orderUserId;
        })
        .catch(() => orderUserId);
};

/**
 * Create (or refresh) the payment intent for an order.
 *
 * The amount is frozen here through `orderTotal` — the same function the order's serializer and
 * the confirmation email call, so the intent cannot ask for a different number than the order
 * shows. Lines alone is not that number: shipping is frozen on the order at checkout and the
 * contract counts it in `totalPrice`. `orderCurrency` resolves the SAME currency the order was
 * priced in — the shop's live setting only for an order that predates the field — so a provider
 * charging in JPY never sees a EUR-shaped amount for a currency change made after the order was
 * placed. Re-asking is the double-click case: it refreshes and answers the same intent, 200 where
 * the first ask was 201; an order whose money already moved answers 409.
 *
 * The provider is asked for an intent only when this payment does not already have one — a second
 * intent for the same order is a second thing the customer could pay.
 *
 * @param orderId - the order to pay
 * @param authContext - the caller; the order must be theirs (admins pass, as everywhere)
 * @returns the payment on the wire, carrying the `clientSecret` the browser finishes against —
 *   the one response that does, since it is never stored and never read back
 */
// Flat `await`s, not a nested `.then()` pyramid, for the same reason `@modules/orders`'
// `crud.ts#create` uses them: each step below depends on the last one's resolved value.
export const createIntent = async (
    orderId: string,
    authContext?: AuthContext
): Promise<ResponseSuccess<Payment> | ResponseReject> => {
    const order = await orderService.getById(orderId, orderService.callerScope(authContext));
    if (!order) return generateReject(404, [t('payments.order-not-found')]);
    // Payable is asked of the order lifecycle rather than compared against a literal here, so
    // this module cannot drift from the owner of the rule — and, unlike a bare `canTransition`
    // check, correctly refuses a second intent on an order that is already `paid`.
    if (!isPayable(order.status)) return notPayable();

    /*
     * Checked fresh against `products`, never against the order's own frozen snapshot: a
     * product removed or deactivated AFTER this order was placed must still block the FIRST
     * payment attempt against it — the auto-cancel `orders`' own listener runs is the normal
     * door, this is the race backstop for the gap between the event and a payment already in
     * flight. Named per line, like `CART_INSUFFICIENT_STOCK`'s `details.lines`.
     */
    const unavailable = await unavailableLines(order);
    if (unavailable.length > 0)
        return generateReject(409, [
            {
                code: ERROR_CODES.ORDER_PRODUCT_UNAVAILABLE,
                message: t('payments.order-product-unavailable'),
                details: { lines: unavailable }
            }
        ]);

    // The provider is asked for an intent only when this payment does not already have one — a
    // second intent for the same order is a second thing the customer could pay.
    const provider = resolvePaymentProvider();
    const payerId = await resolvePayerId(order.userId ? String(order.userId) : undefined);
    const currency = orderCurrency(order);
    const upserted = await paymentRepository.upsertIntent(orderId, payerId, {
        // Explicit fields, not `{ ...order, currency }` — `order` is a hydrated Mongoose
        // document; spreading it copies nothing, since its schema paths are prototype getters,
        // not the document's own enumerable properties.
        amount: orderTotal({ items: order.items, shippingCost: order.shippingCost, currency }),
        currency,
        provider: provider.name
    });
    if (!upserted) return notPayable();
    const { payment, created } = upserted;

    const { providerRef, clientSecret } = await provider.prepare(
        { amount: payment.amount, currency: payment.currency },
        { orderId, paymentId: String(payment._id) }
    );
    const stored = await paymentRepository.attachProviderRef(String(payment._id), providerRef);
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
    if (!payment.providerRef || payment.provider === 'manual') return Promise.resolve();
    return providerNamed(payment.provider).cancel(payment.providerRef, { reason });
};

/**
 * `order.cancelled`'s listener (see `../module.ts`): close a still-open, never-settled intent at
 * the provider once its order is gone, so an abandoned one cannot resolve on its own later with no
 * local row left to catch it. A `succeeded`/`refunded` payment is skipped outright — that
 * money is `payments`' own `order.refund_owed` listener to give back, not this one's to cancel.
 *
 * Best-effort, unlike {@link cancelOpenIntent}'s other caller (`recordOfflinePayment`): the order
 * is already cancelled by the time this runs, so there is no request left here to refuse — a
 * provider failure is only logged, never rethrown, so it cannot stop the cancel that already
 * happened.
 *
 * @param orderId - the order that was cancelled
 */
export const cancelOpenIntentForOrder = (orderId: string): Promise<void> =>
    paymentRepository.findByOrderId(orderId).then((payment) => {
        if (!payment || payment.status === 'succeeded' || payment.status === 'refunded')
            return undefined;

        return cancelOpenIntent(payment, 'Order cancelled').catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: could not cancel order ${orderId}'s open intent at the provider — left open there; the abandoned-payment sweep will eventually delete this row without ever telling it`,
                error
            });
            // Stryker restore all
        });
    });
