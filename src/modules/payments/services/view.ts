/**
 * @module
 * Reading a payment back — the order page's payment panel, and the `actions` a caller may take on
 * what it sees, the same shape `orders`' `OrderActions` publishes.
 */

import { callerForSubject, isUnrestricted } from '@kernel/permissions';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { OrderStatus } from '@types';
import type { Payment, AuthContext } from '@types';
import { orderService, canTransition } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { paymentRepository } from '../repository';
import type { PaymentDocument } from '../model';
import { callerScope } from './scope';
import { CONFIRMABLE_PAYMENT_STATUSES } from './settlement';
import { REFUNDABLE_PAYMENT_STATUS } from './refunds';

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
            .then((order) => generateSuccess(withActions(payment, order, authContext)));
    });

/**
 * What this caller may do to a payment, as the contract's `PaymentActions`.
 *
 * @returns the serialized payment carrying its `actions`
 */
export const withActions = (
    payment: PaymentDocument,
    order: OrderDocument | undefined,
    authContext?: AuthContext
): Payment => ({
    // `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform: the document
    // itself is typed as stored, not as the wire shape `Payment` promises.
    ...(payment.toJSON() as Payment),
    actions: {
        // Confirmable, and the order can still get to `paid`. Both halves, because a retryable
        // decline on an order that has since been cancelled is not a payment anyone may complete.
        // An in-flight payment is deliberately NOT payable: its next step is `sync`, not a second
        // method, and offering the form again is how a customer pays twice.
        pay:
            CONFIRMABLE_PAYMENT_STATUSES.includes(payment.status) &&
            Boolean(order) &&
            canTransition(order!.status, OrderStatus.paid, 'system'),
        // Only an operator returns money, and only money that actually arrived.
        refund:
            authContext !== undefined &&
            isUnrestricted(callerForSubject(authContext, 'Payment')) &&
            payment.status === REFUNDABLE_PAYMENT_STATUS
    }
});
