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
 *
 *    That same gate is what commits the order's held stock. Units are held from checkout and
 *    only actually leave when the money lands, so an unpaid order costs the shop availability
 *    for the length of its reservation window and nothing more.
 * 3. A refund answers a fact, never a plan: `ORDER_CANCELLED` arrives after the cancel is on
 *    disk, and the conditional `succeeded → refunded` move makes the refund at-most-once.
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
import { orderService, orderRepository, sumLineItems, ORDER_STATUS_CHANGED } from '@modules/orders';
import { inventoryService } from '@modules/inventory';
import { userRepository } from '@modules/users';
import { resolvePaymentProvider, type CardDetails } from './providers';
import { paymentRepository } from './repository';
import type { PaymentDocument } from './model';

/** The demo's money is one currency, set per deployment. Carried onto every payment document. */
const defaultCurrency = (): string => process.env.NODE_DEFAULT_CURRENCY ?? 'EUR';

/**
 * Who is paying, resolved against `users` rather than copied off the order.
 *
 * The order already carries a `userId`, and taking it verbatim is what this did before. The
 * difference matters for the thing a payment IS: a financial record that outlives the order page.
 * A payment history — "everything this account has ever paid" — is a query on this id, so it wants
 * to be an id that pointed at a real account at the moment the money moved, not one inherited
 * from a row that may have been written long before.
 *
 * A payer that cannot be resolved does NOT refuse the payment. Orders deliberately survive the
 * deletion of the account that placed them, so an unresolvable payer is a legitimate state, and
 * failing here would make a deleted account's outstanding order unpayable rather than merely
 * unattributed. The order's own id is kept and the gap is logged — the history simply records the
 * id it was given.
 *
 * @param orderUserId - the account id the order carries
 * @returns the id to persist on the payment
 */
const resolvePayerId = (orderUserId: string): Promise<string> =>
    userRepository
        .findById(orderUserId)
        .then((user) => {
            if (user) return String(user.id);
            logger.warn(
                `Payment intent for a user that no longer resolves (${orderUserId}) — recording the order's id unverified`
            );
            return orderUserId;
        })
        .catch(() => orderUserId);

/** Ownership, payments-style: yours or you are staff — anything else reads as absence. */
const isOwnedBy = (
    payment: PaymentDocument,
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
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
    orderService.getById(orderId, orderService.callerScope(authContext)).then((order) => {
        if (!order) return generateReject(404, [t('payments.order-not-found')]);
        if (order.status !== 'pending')
            return generateReject(409, [
                { code: 'PAYMENT_ORDER_NOT_PAYABLE', message: t('payments.order-not-payable') }
            ]);

        return resolvePayerId(String(order.userId))
            .then((payerId) =>
                paymentRepository.upsertIntent(orderId, payerId, {
                    amount: sumLineItems(order.items).price,
                    currency: defaultCurrency(),
                    provider: resolvePaymentProvider().name
                })
            )
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
    card: CardDetails,
    authContext?: { id?: string; admin?: boolean }
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
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

        /*
         * The units finally leave. Until now they were HELD — unavailable since checkout, still
         * on the shelf, still recoverable if the customer never paid.
         *
         * After the order move, for the same reason rule 2 gives for the charge: the conditional
         * `pending → paid` is what makes this at most once. The answer is not checked — `false`
         * means an expiry sweep beat the payment to the hold, which this module cannot fix and
         * `inventory` logs; the customer has a paid order either way.
         */
        await inventoryService.commitForOrder(String(payment.orderId));

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
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
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

/** The module's one service handle. Named for the record it serves, like `paymentRepository`. */
export const paymentService = {
    createIntent,
    confirmPayment,
    getForOrder,
    refundForOrder
};
