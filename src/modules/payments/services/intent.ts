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
import { OrderStatus } from '@types';
import type { Payment, AuthContext } from '@types';
import { orderService, orderTotal, canTransition } from '@modules/orders';
import { userRepository } from '@modules/users';
import { defaultCurrency } from '../config';
import { resolvePaymentProvider } from '../providers';
import { paymentRepository } from '../repository';

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
const resolvePayerId = (orderUserId: string | undefined): Promise<string | undefined> => {
    if (orderUserId === undefined) return Promise.resolve(undefined);

    return userRepository
        .findById(orderUserId)
        .then((user) => {
            if (user) return user.id;
            logger.warn(
                `Payment intent for a user that no longer resolves (${orderUserId}) — recording the order's id unverified`
            );
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
 * contract counts it in `totalPrice`. Re-asking is the double-click case and answers the same
 * intent; an order whose money already moved answers 409.
 *
 * The provider is asked for an intent only when this payment does not already have one — a second
 * intent for the same order is a second thing the customer could pay.
 *
 * @param orderId - the order to pay
 * @param authContext - the caller; the order must be theirs (admins pass, as everywhere)
 * @returns the payment on the wire, carrying the `clientSecret` the browser finishes against —
 *   the one response that does, since it is never stored and never read back
 */
export const createIntent = (
    orderId: string,
    authContext?: AuthContext
): Promise<ResponseSuccess<Payment> | ResponseReject> =>
    orderService.getById(orderId, orderService.callerScope(authContext)).then((order) => {
        if (!order) return generateReject(404, [t('payments.order-not-found')]);
        // Payable means "can still reach `paid`" — asked of the order lifecycle rather than
        // compared against a literal here, so this module cannot drift from the owner of the rule.
        if (!canTransition(order.status, OrderStatus.paid, 'system'))
            return generateReject(409, [
                { code: 'PAYMENT_ORDER_NOT_PAYABLE', message: t('payments.order-not-payable') }
            ]);

        const provider = resolvePaymentProvider();

        return resolvePayerId(order.userId ? String(order.userId) : undefined)
            .then((payerId) =>
                paymentRepository.upsertIntent(orderId, payerId, {
                    amount: orderTotal(order),
                    currency: defaultCurrency(),
                    provider: provider.name
                })
            )
            .then((payment) => {
                if (!payment)
                    return generateReject(409, [
                        {
                            code: 'PAYMENT_ORDER_NOT_PAYABLE',
                            message: t('payments.order-not-payable')
                        }
                    ]);

                return provider
                    .prepare(
                        { amount: payment.amount, currency: payment.currency },
                        { orderId, paymentId: String(payment._id) }
                    )
                    .then(({ providerRef, clientSecret }) =>
                        paymentRepository
                            .attachProviderRef(String(payment._id), providerRef)
                            .then((stored) => ({
                                // `.toJSON()` applies the model's `_id` → `id` / date transform.
                                ...((stored ?? payment).toJSON() as Payment),
                                clientSecret
                            }))
                    )
                    .then((prepared) => generateSuccess(prepared, 201));
            });
    });
