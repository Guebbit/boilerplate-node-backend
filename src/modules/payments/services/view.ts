/**
 * @module
 * Reading a payment back — the order page's payment panel, and the `actions` a caller may take on
 * what it sees, the same shape `orders`' `OrderActions` publishes.
 */

import { t } from '@infrastructure/i18n';
import { callerForSubject } from '@kernel/permissions';
import { holds } from '@kernel/ability';
import {
    generateReject,
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import {
    RefundStatus,
    type OrderPaymentsResponse,
    type Payment,
    type Refund,
    type AuthContext
} from '@types';
import { orderService, isPayable } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { paymentRepository } from '../repository';
import type { PaymentDocument } from '../model';
import {
    CONFIRMABLE_PAYMENT_STATUSES,
    IN_FLIGHT_PAYMENT_STATUSES,
    REFUNDABLE_PAYMENT_STATUS,
    isHandRecorded,
    isOpenTransfer
} from '../domain';
import { resolvePaymentProvider } from '../providers';
import { presentPayment } from '../presenter';
import { remainingOf } from './refunds';
import { callerScope, readsAllPayments } from './scope';
import { paymentNotFound } from './errors';

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
    paymentRepository
        .findByOrderId(orderId, callerScope(authContext))
        .then((payment) =>
            payment
                ? presentWithActions(payment, authContext).then((wire) => generateSuccess(wire))
                : paymentNotFound()
        );

/**
 * The payments of an order, as `GET /orders/{id}/payments` lists them: unpaged, none or one (an
 * order has one payment row). The order is read first, so a caller who cannot see it gets the 404
 * and one who can gets `[]` for an order nobody has started paying.
 *
 * @param orderId - the order
 * @param authContext - the caller; sees only their own, `display:Payment` sees anyone's
 * @returns the list, or the 404 for an order the caller cannot see
 */
export const listForOrder = (
    orderId: string,
    authContext?: AuthContext
): Promise<ResponseSuccess<OrderPaymentsResponse> | ResponseReject> =>
    orderService.getForCaller(orderId, authContext).then((order) => {
        if (!order) return generateReject(404, [t('orders.not-found')]);

        return paymentRepository
            .findByOrderId(orderId, callerScope(authContext))
            .then((payment) => (payment ? [withActions(payment, order, authContext)] : []))
            .then((items) => generateSuccess({ items }));
    });

/**
 * One payment by its own id — the address `Location` names after `POST /payments`.
 *
 * @param paymentId - the payment
 * @param authContext - the caller; sees only their own, `display:Payment` sees anyone's
 * @returns the payment with its `actions`, or the same 404 whether it is missing or another's
 */
export const getById = (
    paymentId: string,
    authContext?: AuthContext
): Promise<ResponseSuccess<Payment> | ResponseReject> =>
    paymentRepository
        .findByIdScoped(paymentId, callerScope(authContext))
        .then((payment) =>
            payment
                ? presentWithActions(payment, authContext).then((wire) => generateSuccess(wire))
                : paymentNotFound()
        );

/**
 * One refund record of a payment, addressed through that payment.
 *
 * @param paymentId - the payment carrying the refund
 * @param refundId - the refund record
 * @param authContext - the caller; scoped exactly like {@link getById}
 * @returns the refund on the wire, or the one 404 for a missing payment, a missing record or another's payment
 */
export const getRefund = (
    paymentId: string,
    refundId: string,
    authContext?: AuthContext
): Promise<ResponseSuccess<Refund> | ResponseReject> =>
    paymentRepository.findByIdScoped(paymentId, callerScope(authContext)).then((payment) => {
        const refund = payment
            ? presentPayment(payment, readsAllPayments(authContext)).refunds.find(
                  (record) => record.id === refundId
              )
            : undefined;
        return refund ? generateSuccess(refund) : paymentNotFound();
    });

/**
 * The record a refund just opened: the newest one on the payment, as the caller may see it.
 *
 * @param payment - the payment a successful refund answered with
 * @param authContext - the caller, for the staff-only fields
 */
export const newestRefund = (payment: PaymentDocument, authContext?: AuthContext) =>
    presentPayment(payment, readsAllPayments(authContext)).refunds.at(-1);

/**
 * Whether the caller is the account that made this payment and may spend a basket at all.
 *
 * @param payment - the payment being served
 * @param authContext - the caller, or `undefined` for no request behind this read
 * @returns `false` for an unproven address, for another customer, and for a payment whose account was erased
 */
const isPayerWithCheckout = (payment: PaymentDocument, authContext?: AuthContext): boolean =>
    authContext !== undefined &&
    payment.userId?.toString() === authContext.id &&
    holds(callerForSubject(authContext, 'Payment'), 'checkout', 'Cart');

/**
 * Whether the caller is staff who may return money: holds `create:Refund` by name — a moderator
 * holds exactly this key, and asking for anything broader would have hidden the action despite
 * the key they do hold.
 *
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
const mayRefund = (authContext?: AuthContext): boolean =>
    authContext !== undefined &&
    holds(callerForSubject(authContext, 'Payment'), 'create', 'Refund');

/**
 * Whether the buyer may pay this payment: confirmable (or a transfer to take over with a card the
 * deployment can actually take), the order can still reach `paid`, and the caller is its payer.
 *
 * @param payment - the payment being served
 * @param order - the payment's order, when the read has it
 * @param authContext - the caller
 */
const mayPay = (
    payment: PaymentDocument,
    order: OrderDocument | undefined,
    authContext?: AuthContext
): boolean => {
    // Confirmable, and the order can still get to `paid`. Both halves, because a retryable decline
    // on an order that has since been cancelled is not a payment anyone may complete.
    const payable =
        CONFIRMABLE_PAYMENT_STATUSES.includes(payment.status) ||
        // A transfer is taken over with a card through the intent, which needs a provider.
        (isOpenTransfer(payment) && resolvePaymentProvider() !== undefined);
    // Then the caller's half, the same two questions `Order.actions.pay` asks.
    return (
        payable &&
        order !== undefined &&
        isPayable(order.status) &&
        isPayerWithCheckout(payment, authContext)
    );
};

/**
 * Whether the buyer may finish an in-flight payment at the provider (`POST /payments/:id/sync`):
 * the browser has a challenge to answer or the provider has not decided. Narrower than the route
 * on purpose — it also accepts a payment awaiting confirmation or declined, whose next step is
 * `pay` — so the two flags are never both true.
 *
 * @param payment - the payment being served
 * @param authContext - the caller
 */
const maySync = (payment: PaymentDocument, authContext?: AuthContext): boolean =>
    IN_FLIGHT_PAYMENT_STATUSES.includes(payment.status) &&
    !isHandRecorded(payment) &&
    isPayerWithCheckout(payment, authContext);

/**
 * The refunds an operator may mark as returned: pending records on a hand-paid payment.
 *
 * @param payment - the payment being served
 * @param authContext - the caller
 */
const settleableByHand = (payment: PaymentDocument, authContext?: AuthContext): string[] =>
    mayRefund(authContext) &&
    payment.status === REFUNDABLE_PAYMENT_STATUS &&
    isHandRecorded(payment)
        ? payment.refunds
              .filter((refund) => refund.status === RefundStatus.pending)
              .map((refund) => String(refund._id))
        : [];

/**
 * What this caller may do to a payment, as the contract's `PaymentActions`.
 *
 * @param payment - the payment
 * @param order - its order, for `pay`; absent where the payment cannot be payable (a `succeeded`
 *   one, a list row)
 * @param authContext - the caller
 * @returns the serialized payment carrying its `actions`
 */
export const withActions = (
    payment: PaymentDocument,
    order: OrderDocument | undefined,
    authContext?: AuthContext
): Payment => ({
    ...presentPayment(payment, readsAllPayments(authContext)),
    actions: {
        pay: mayPay(payment, order, authContext),
        sync: maySync(payment, authContext),
        // Only an operator returns money, and only money that actually arrived.
        refund:
            mayRefund(authContext) &&
            payment.status === REFUNDABLE_PAYMENT_STATUS &&
            remainingOf(payment) > 0,
        settleByHand: settleableByHand(payment, authContext)
    }
});

/**
 * A payment on the wire for the response of a write that moved it (confirm, sync, intent), with
 * its `actions`: the order is read for `pay` alone, the same read {@link getForOrder} does.
 *
 * @param payment - the payment the write answered with
 * @param authContext - the caller
 */
export const presentWithActions = (
    payment: PaymentDocument,
    authContext?: AuthContext
): Promise<Payment> =>
    orderService
        .getById(String(payment.orderId), orderService.callerScope(authContext))
        .then((order) => withActions(payment, order ?? undefined, authContext));
