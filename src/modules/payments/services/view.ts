/**
 * @module
 * Reading a payment back — the order page's payment panel, and the `actions` a caller may take on
 * what it sees, the same shape `orders`' `OrderActions` publishes.
 */

import { callerForSubject } from '@kernel/permissions';
import { holdsKey } from '@kernel/ability';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { Payment, AuthContext } from '@types';
import { orderService, isPayable } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { paymentRepository } from '../repository';
import type { PaymentDocument } from '../model';
import { CONFIRMABLE_PAYMENT_STATUSES, REFUNDABLE_PAYMENT_STATUS } from '../domain';
import { presentPayment } from '../presenter';
import { callerScope } from './scope';

/**
 * The payment behind an order, for the order page's payment panel.
 *
 * @param orderId - the order
 * @param authContext - the caller; sees only their own, admins see anyone's
 */
export const getForOrder = (
    orderId: string,
    authContext?: AuthContext
): Promise<ResponseSuccess<Payment> | ResponseReject> =>
    paymentRepository.findByOrderId(orderId, callerScope(authContext)).then((payment) => {
        if (!payment) return generateReject(404, [t('payments.not-found')]);

        // The order is read for `pay` alone: payability is half a payment's status and half the
        // order's, and answering it here is what stops a client deciding it from two fields.
        return orderService
            .getById(orderId, orderService.callerScope(authContext))
            .then((order) =>
                withActions(payment, order, authContext).then((payload) => generateSuccess(payload))
            );
    });

/**
 * Whether the caller is the account that made this payment and may spend a basket at all.
 *
 * @param payment - the payment being served
 * @param authContext - the caller, or `undefined` for no request behind this read
 * @returns `false` for staff, for another customer, and for a payment whose account was erased
 */
const isPayerWithCheckout = (payment: PaymentDocument, authContext?: AuthContext): boolean =>
    authContext !== undefined &&
    payment.userId?.toString() === authContext.id &&
    holdsKey(callerForSubject(authContext, 'Payment'), 'cart.self.checkout');

/**
 * What this caller may do to a payment, as the contract's `PaymentActions`. Async because the
 * refund is also the own-money rule's question: an operator returns a customer's money, never
 * their own, nor an equal's or a superior's.
 *
 * @returns the serialized payment carrying its `actions`
 */
export const withActions = (
    payment: PaymentDocument,
    order: OrderDocument | undefined,
    authContext?: AuthContext
): Promise<Payment> =>
    (order ? orderService.handlesMoneyOf(order, authContext) : Promise.resolve(true)).then(
        (handlesMoney) => ({
            ...presentPayment(payment),
            actions: {
                // Confirmable, and the order can still get to `paid`. Both halves, because a
                // retryable decline on an order that has since been cancelled is not a payment
                // anyone may complete. An in-flight payment is deliberately NOT payable: its next
                // step is `sync`, not a second method, and offering the form again is how a
                // customer pays twice.
                // Then the caller's half, the same two questions `Order.actions.pay` asks: paying
                // is the payer's own step, and only an account that shops holds `checkout`. Staff
                // reading the payment are never offered a card form they could not submit.
                pay:
                    CONFIRMABLE_PAYMENT_STATUSES.includes(payment.status) &&
                    Boolean(order) &&
                    isPayable(order!.status) &&
                    isPayerWithCheckout(payment, authContext),
                // Only an operator returns money, only money that actually arrived, and only for
                // a buyer the operator ranks above and is not. `payments.any.update` by name — a
                // moderator holds exactly this key, and asking for anything broader would have
                // hidden the refund action despite the key they do hold.
                refund:
                    authContext !== undefined &&
                    handlesMoney &&
                    holdsKey(callerForSubject(authContext, 'Payment'), 'payments.any.update') &&
                    payment.status === REFUNDABLE_PAYMENT_STATUS
            }
        })
    );
