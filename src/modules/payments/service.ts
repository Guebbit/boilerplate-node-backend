/**
 * Payments — how an order's money moves, behind the provider port.
 *
 * The service owns three rules and delegates everything else:
 *
 * 1. Only a `pending` order can start paying, and only its owner can pay it.
 * 2. The order's move to `paid` is the gate, not the charge: the charge happens first (that is
 *    how PSPs work — the money is taken before your database hears about it), and if the order
 *    slipped away in between (cancelled, already paid by a racing tab) the charge is refunded
 *    on the spot. Money moved if and only if the order says `paid`.
 * 3. A refund answers a fact, never a plan: `ORDER_CANCELLED` arrives after the cancel is on
 *    disk, and the conditional `succeeded → refunded` move makes the refund at-most-once.
 */

import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import {
    generateSuccess,
    generateReject,
    type IResponseSuccess,
    type IResponseReject
} from '@infrastructure/http/response';
import { emitDomainEvent } from '@kernel/events';
import { orderService, orderRepository, sumLineItems, ORDER_STATUS_CHANGED } from '@modules/orders';
import { resolvePaymentProvider, type ICardDetails } from './providers';
import { paymentRepository } from './repository';
import type { IPaymentDocument } from './model';

/** The demo's money is one currency, set per deployment. Carried onto every payment document. */
const defaultCurrency = (): string => process.env.NODE_DEFAULT_CURRENCY ?? 'EUR';

/** Ownership, payments-style: yours or you are staff — anything else reads as absence. */
const isOwnedBy = (
    payment: IPaymentDocument,
    authContext?: { id?: string; admin?: boolean }
): boolean => Boolean(authContext?.admin) || String(payment.userId) === authContext?.id;

/**
 * Create (or refresh) the payment intent for an order.
 *
 * The amount is frozen here, from the order's own lines — the same `sumLineItems` the order
 * quotes, so the intent cannot ask for a different number than the order shows. Re-asking is the
 * double-click case and answers the same intent; an order whose money already moved answers 409.
 *
 * @param orderId - the order to pay
 * @param authContext - the caller; the order must be theirs (admins pass, as everywhere)
 */
export const createIntent = (
    orderId: string,
    authContext?: { id?: string; admin?: boolean }
): Promise<IResponseSuccess<IPaymentDocument> | IResponseReject> =>
    orderService.getById(orderId, orderService.callerScope(authContext)).then((order) => {
        if (!order) return generateReject(404, [t('payments.order-not-found')]);
        if (order.status !== 'pending')
            return generateReject(409, [
                { code: 'PAYMENT_ORDER_NOT_PAYABLE', message: t('payments.order-not-payable') }
            ]);

        return paymentRepository
            .upsertIntent(orderId, String(order.userId), {
                amount: sumLineItems(order.items).price,
                currency: defaultCurrency(),
                provider: resolvePaymentProvider().name
            })
            .then((payment) =>
                payment
                    ? generateSuccess(payment, 201)
                    : generateReject(409, [
                          {
                              code: 'PAYMENT_ORDER_NOT_PAYABLE',
                              message: t('payments.order-not-payable')
                          }
                      ])
            );
    });

/**
 * Confirm a payment — the fake card dialog's submit.
 *
 * See the module docblock for the ordering: charge, then the conditional order move, then the
 * payment row; a charge whose order slipped away is refunded immediately. A decline updates the
 * row (so the order page can show it) and answers 409 with `PAYMENT_DECLINED` — a refusal, not
 * an error in the request.
 *
 * @param paymentId - the intent being confirmed
 * @param card - what the customer typed
 * @param authContext - the caller; the payment must be theirs
 */
export const confirmPayment = (
    paymentId: string,
    card: ICardDetails,
    authContext?: { id?: string; admin?: boolean }
): Promise<IResponseSuccess<IPaymentDocument> | IResponseReject> =>
    paymentRepository.findById(paymentId).then(async (payment) => {
        if (!payment || !isOwnedBy(payment, authContext))
            return generateReject(404, [t('payments.not-found')]);
        if (payment.status !== 'requires_confirmation' && payment.status !== 'declined')
            return generateReject(409, [
                { code: 'PAYMENT_NOT_CONFIRMABLE', message: t('payments.not-confirmable') }
            ]);

        const provider = resolvePaymentProvider();
        const charge = { amount: payment.amount, currency: payment.currency };
        const cardLast4 = card.cardNumber.replaceAll(/\s/g, '').slice(-4);

        const outcome = await provider.charge(charge, card);
        if (outcome === 'declined') {
            await paymentRepository.updateStatusIfIn(
                String(payment.orderId),
                ['requires_confirmation', 'declined'],
                'declined',
                { cardLast4 }
            );
            return generateReject(409, [
                { code: 'PAYMENT_DECLINED', message: t('payments.declined') }
            ]);
        }

        const paidOrder = await orderRepository.updateStatusIfIn(
            String(payment.orderId),
            ['pending'],
            'paid',
            {}
        );
        if (!paidOrder) {
            // The money moved but the order was gone (cancelled, or a racing tab won). Put it
            // straight back — the invariant is the module docblock's rule 2.
            await provider.refund(charge);
            return generateReject(409, [
                { code: 'PAYMENT_ORDER_NOT_PAYABLE', message: t('payments.order-not-payable') }
            ]);
        }

        const confirmed = await paymentRepository.updateStatusIfIn(
            String(payment.orderId),
            ['requires_confirmation', 'declined'],
            'succeeded',
            { cardLast4 }
        );

        await emitDomainEvent(ORDER_STATUS_CHANGED, {
            orderId: String(payment.orderId),
            from: 'pending',
            to: 'paid'
        });

        return generateSuccess(confirmed ?? payment, 200, t('payments.confirm-success'));
    });

/**
 * The payment behind an order, for the order page's payment panel.
 *
 * @param orderId - the order
 * @param authContext - the caller; sees only their own, admins see anyone's
 */
export const getForOrder = (
    orderId: string,
    authContext?: { id?: string; admin?: boolean }
): Promise<IResponseSuccess<IPaymentDocument> | IResponseReject> =>
    paymentRepository.findByOrderId(orderId).then((payment) => {
        if (!payment || !isOwnedBy(payment, authContext))
            return generateReject(404, [t('payments.not-found')]);
        return generateSuccess(payment);
    });

/**
 * `ORDER_CANCELLED`'s listener: give the money back if any was taken.
 *
 * The conditional `succeeded → refunded` move is the idempotence — a second event (or a cancel
 * of a never-paid order) finds nothing in `succeeded` and does nothing. Event handlers have no
 * request to answer, so the outcome is logged: for an unattended compensation, the log line IS
 * the contract, same as the token-cleanup job's.
 *
 * @param orderId - the order that was cancelled
 */
export const refundForOrder = (orderId: string): Promise<void> =>
    paymentRepository.updateStatusIfIn(orderId, ['succeeded'], 'refunded').then(async (payment) => {
        if (!payment) return;
        await resolvePaymentProvider().refund({
            amount: payment.amount,
            currency: payment.currency
        });
        logger.info(
            `Payment for order ${orderId} refunded (${payment.amount} ${payment.currency})`
        );
    });
