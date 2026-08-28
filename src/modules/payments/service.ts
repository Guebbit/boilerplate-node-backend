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
import { createOwnerScope } from '@kernel/authorization';
import { OrderStatus } from '@types';
import type { PaymentStatus, Caller } from '@types';
import {
    orderService,
    orderRepository,
    orderTotal,
    canTransition,
    statusesLeadingTo,
    ORDER_STATUS_CHANGED
} from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { inventoryService } from '@modules/inventory';
import { userRepository } from '@modules/users';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { paymentsAnalyticsEvents } from './analytics';
import { paymentsAuditActions } from './audit';
import { defaultCurrency } from './config';
import { resolvePaymentProvider, cardLastFour, type CardDetails } from './providers';
import { paymentRepository } from './repository';
import type { PaymentDocument } from './model';

/**
 * The payment statuses the confirm endpoint accepts. `declined` is here because a decline is
 * retryable with another card, which is the one place this lifecycle goes backwards.
 *
 * An ARRAY rather than a `Set`, because this module reads the rule two ways and both readers are
 * below it: as a membership test (the confirm's precondition, and `withActions`' `pay`), and as
 * the `$in` of the conditional writes that re-assert the same precondition while mongod holds the
 * document. A `Set` serves only the first and has to be spread back into an array for the second,
 * which is how this rule came to be written out four times in one file — and four spellings is
 * four places to forget that a decline is retryable the next time this lifecycle changes.
 */
const CONFIRMABLE_PAYMENT_STATUSES: readonly PaymentStatus[] = [
    'requires_confirmation',
    'declined'
];

/** The only status money can come back from: it has to have arrived first. */
const REFUNDABLE_PAYMENT_STATUS: PaymentStatus = 'succeeded';

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
            if (user) return user.id;
            logger.warn(
                `Payment intent for a user that no longer resolves (${orderUserId}) — recording the order's id unverified`
            );
            return orderUserId;
        })
        .catch(() => orderUserId);

/**
 * Which payments a caller may read — the same rule `orderService.callerScope` applies, over this
 * module's collection.
 *
 * `ownerScope` rather than a `visibleScope`: payments are never soft-deleted, so "whose" is the
 * only axis there is. The rest — the `undefined` for admins, the scope riding in the read, the
 * throw on a caller with no id — is `createOwnerScope`'s to explain.
 */
const callerScope = createOwnerScope(paymentRepository.ownerScope);

/**
 * Create (or refresh) the payment intent for an order.
 *
 * The amount is frozen here through `orderTotal` — the same function the order's serializer and
 * the confirmation email call, so the intent cannot ask for a different number than the order
 * shows. Lines alone is not that number: shipping is frozen on the order at checkout and the
 * contract counts it in `totalPrice`. Re-asking is the double-click case and answers the same
 * intent; an order whose money already moved answers 409.
 *
 * @param orderId - the order to pay
 * @param authContext - the caller; the order must be theirs (admins pass, as everywhere)
 */
export const createIntent = (
    orderId: string,
    authContext?: Caller
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
    orderService.getById(orderId, orderService.callerScope(authContext)).then((order) => {
        if (!order) return generateReject(404, [t('payments.order-not-found')]);
        // Payable means "can still reach `paid`" — asked of the order lifecycle rather than
        // compared against a literal here, so this module cannot drift from the owner of the rule.
        if (!canTransition(order.status, OrderStatus.paid, 'system'))
            return generateReject(409, [
                { code: 'PAYMENT_ORDER_NOT_PAYABLE', message: t('payments.order-not-payable') }
            ]);

        return resolvePayerId(String(order.userId))
            .then((payerId) =>
                paymentRepository.upsertIntent(orderId, payerId, {
                    amount: orderTotal(order),
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
    authContext: Caller | undefined,
    context: CallerContext
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
    paymentRepository
        .findByIdScoped(paymentId, callerScope(authContext))
        .then(async (payment) => {
            if (!payment) return generateReject(404, [t('payments.not-found')]);
            if (!CONFIRMABLE_PAYMENT_STATUSES.includes(payment.status))
                return generateReject(409, [
                    { code: 'PAYMENT_NOT_CONFIRMABLE', message: t('payments.not-confirmable') }
                ]);

            const provider = resolvePaymentProvider();
            const charge = { amount: payment.amount, currency: payment.currency };
            const cardLast4 = cardLastFour(card.cardNumber);

            const outcome = await provider.charge(charge, card);
            if (outcome === 'declined') {
                // The precondition above, re-asserted in the filter: the read that passed it is
                // already stale by the time the provider answers, and a racing tab must not be
                // able to land a decline on a payment that has since succeeded.
                await paymentRepository.updateStatusIfIn(
                    String(payment.orderId),
                    CONFIRMABLE_PAYMENT_STATUSES,
                    'declined',
                    { cardLast4 }
                );
                return generateReject(409, [
                    { code: 'PAYMENT_DECLINED', message: t('payments.declined') }
                ]);
            }

            const paidOrder = await orderRepository.updateStatusIfIn(
                String(payment.orderId),
                // Same row as the precondition above, read the other way round.
                statusesLeadingTo(OrderStatus.paid, 'system'),
                OrderStatus.paid,
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
                CONFIRMABLE_PAYMENT_STATUSES,
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
        })
        .then((result) => {
            // Only these two outcomes are events: `PAYMENT_DECLINED` is a card the provider refused,
            // reportable like any other confirm attempt. The other rejections (payment not found, not
            // in a confirmable state, the order gone) are request-shape or race problems, not a fact
            // about the money — nothing here to attribute to a card.
            const declined =
                !result.success && result.errors.some(({ code }) => code === 'PAYMENT_DECLINED');
            if (result.success || declined) {
                emitAuditEvent(
                    buildAuditEvent(context, {
                        action: result.success
                            ? paymentsAuditActions.PAYMENT_CONFIRMED
                            : paymentsAuditActions.PAYMENT_FAILED,
                        outcome: result.success ? 'success' : 'failure',
                        metadata: { payment_id: paymentId }
                    })
                );
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(context),
                    event: result.success
                        ? paymentsAnalyticsEvents.PAYMENT_SUCCEEDED
                        : paymentsAnalyticsEvents.PAYMENT_DECLINED,
                    properties: { payment_id: paymentId }
                });
            }
            return result;
        });

/**
 * The payment behind an order, for the order page's payment panel.
 *
 * @param orderId - the order
 * @param authContext - the caller; sees only their own, admins see anyone's
 */
export const getForOrder = (
    orderId: string,
    authContext?: Caller
): Promise<ResponseSuccess<Record<string, unknown>> | ResponseReject> =>
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
 * @param payment - the payment record
 * @param order - the order it belongs to, when it is still readable by this caller
 * @param authContext - the caller
 * @returns the serialized payment carrying its `actions`
 */
const withActions = (
    payment: PaymentDocument,
    order: OrderDocument | undefined,
    authContext?: Caller
): Record<string, unknown> => ({
    ...(payment.toJSON() as Record<string, unknown>),
    actions: {
        // Confirmable, and the order can still get to `paid`. Both halves, because a retryable
        // decline on an order that has since been cancelled is not a payment anyone may complete.
        pay:
            CONFIRMABLE_PAYMENT_STATUSES.includes(payment.status) &&
            Boolean(order) &&
            canTransition(order!.status, OrderStatus.paid, 'system'),
        // Only an operator returns money, and only money that actually arrived.
        refund: Boolean(authContext?.admin) && payment.status === REFUNDABLE_PAYMENT_STATUS
    }
});

/**
 * Refund an order's payment — the operator action, and the listener's compensation.
 *
 * The conditional `succeeded → refunded` move IS the idempotence: a second call finds nothing in
 * `succeeded` and answers `null`, which the two callers read differently. Nothing else in this
 * module may move money, so both paths come through here.
 *
 * @param orderId - the order whose payment is being returned
 * @returns the refunded payment, or `null` when there was nothing to return
 */
const performRefund = (orderId: string): Promise<PaymentDocument | null> =>
    paymentRepository
        .updateStatusIfIn(orderId, [REFUNDABLE_PAYMENT_STATUS], 'refunded')
        .then((payment) => {
            if (!payment) return null;
            return resolvePaymentProvider()
                .refund({ amount: payment.amount, currency: payment.currency })
                .then(() => {
                    logger.info(
                        `Payment for order ${orderId} refunded (${payment.amount} ${payment.currency})`
                    );
                    return payment;
                });
        });

/**
 * `POST /payments/order/:orderId/refund` — the operator returning money on its own.
 *
 * Separate from cancelling: a goodwill refund leaves the order where it is, and "cancel and
 * refund" is a client sending both calls. Admin-only at the route.
 *
 * @param orderId - the order whose payment is being returned
 * @param authContext - the caller, for the read that distinguishes 404 from 409
 * @returns the refunded payment, or a refusal naming which case it was
 */
export const refundByOrder = (
    orderId: string,
    authContext?: Caller
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
    performRefund(orderId).then((refunded) => {
        if (refunded) return generateSuccess(refunded, 200, t('payments.refund-success'));

        // Nothing moved. Which refusal it was is a second read, exactly as the order cancel does:
        // the decision is already made, and this only chooses the sentence.
        return paymentRepository.findByOrderId(orderId, callerScope(authContext)).then((payment) =>
            payment
                ? generateReject(409, [
                      {
                          code: 'PAYMENT_NOT_REFUNDABLE',
                          message: t('payments.not-refundable')
                      }
                  ])
                : generateReject(404, [t('payments.not-found')])
        );
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
    performRefund(orderId).then(() => undefined);

/** The module's one service handle. Named for the record it serves, like `paymentRepository`. */
export const paymentService = {
    createIntent,
    confirmPayment,
    getForOrder,
    refundForOrder,
    refundByOrder
};
