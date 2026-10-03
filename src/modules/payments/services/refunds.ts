/**
 * @module
 * Giving money back — the operator action (`refundByOrder`) and the `ORDER_REFUND_OWED` listener's
 * compensation (`refundForOrder`), both through `performRefund`. Nothing else in this module may
 * move money out.
 *
 * Record:   a refund is a row on the payment, opened BEFORE the provider is asked. Opening is one
 *           conditional write that also raises `amountRefunded`, so two racing refunds cannot
 *           return more than was paid.
 * Order:    the provider is asked next, and the record settles only once it confirms. A refusal
 *           leaves the record `failed` — open, retried by the sweep with the SAME idempotency key
 *           — instead of recording money as returned before anyone asked.
 * Full:     the payment moves `succeeded → refunded` only when the records add up to `amount`. A
 *           partial refund leaves it `succeeded`, which is what keeps the rest refundable.
 * Provider: dispatched on the PAYMENT's own `provider`, never the deployment's configured one — a
 *           `manual` payment has no provider to ask, and a real PSP refund must go back to
 *           whichever provider actually took the money, even if the deployment has since switched.
 */

import { Types, type ClientSession } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { AuthContext } from '@types';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import type { DomainEventMap } from '@kernel/events';
import { announceInTransaction } from '@kernel/outbox';
import { SYSTEM_ACTOR, callerForSubject } from '@kernel/permissions';
import {
    orderService,
    mailBuyer,
    refundIssuedEmail,
    toMinorUnits,
    toDecimalAmount,
    addMoney,
    subtractMoney,
    type Money
} from '@modules/orders';
import { paymentsAuditActions } from '../audit';
import { providerNamed } from '../providers';
import { paymentRepository } from '../repository';
import { PAYMENT_REFUNDED } from '../events';
import type { PaymentDocument, RefundRecord, RefundReason } from '../model';
import { REFUNDABLE_PAYMENT_STATUS } from '../domain';
import { callerScope } from './scope';
import { ERROR_CODES } from '@api/error-codes';

/** What one refund is asked to do. */
export interface RefundRequest {
    /** A decimal in the payment's currency; absent means everything still refundable. */
    amount?: number;
    /** Why the money goes back — recorded on the refund. */
    reason: RefundReason;
    /** The return this pays for, when `reason` is `return` — recorded so it can be closed later. */
    returnId?: string;
}

/** The request the automatic callers make: everything left, for a cancellation. */
const CANCELLATION_REQUEST: RefundRequest = Object.freeze({ reason: 'cancellation' });

/** A refund that was just opened, with the payment as it stood right after. */
interface OpenedRefund {
    payment: PaymentDocument;
    refund: RefundRecord;
}

/** How long a provider error is kept on the record — enough to diagnose, not a log dump. */
const MAX_ERROR_LENGTH = 500;

/**
 * What is still refundable on a payment, in minor units: what was paid minus what has been asked
 * back (pending counts — see `PaymentDocument.amountRefunded`).
 * @param payment - the payment
 */
export const remainingOf = (payment: PaymentDocument): Money =>
    subtractMoney(
        toMinorUnits(payment.amount, payment.currency),
        toMinorUnits(payment.amountRefunded, payment.currency)
    );

/**
 * Record, unattended, that a hand-paid order's refund is left for an operator — the
 * automatic listener path only; `refundByOrder`'s own admin call never reaches this.
 * @param orderId - the order whose payment stays `succeeded` until an operator confirms it
 * @param payment - the payment left untouched
 */
const leaveForOperator = (orderId: string, payment: PaymentDocument): Promise<PaymentDocument> => {
    // Stryker disable all
    logger.warn(
        `Payment for order ${orderId} was paid by hand — left \`succeeded\` for an operator to confirm the money actually went back.`
    );
    // Stryker restore all
    // No `actor_role`/`actor_user_id` override needed: `buildAuditEvent`'s defaults already read
    // them off `SYSTEM_ACTOR`'s own caller.
    recordAudit(
        { caller: callerForSubject(SYSTEM_ACTOR, 'Payment'), analyticsConsent: false },
        {
            action: paymentsAuditActions.PAYMENT_REFUND_OWED_BY_HAND,
            outcome: 'success',
            target_type: 'order',
            target_id: orderId
        }
    );
    return Promise.resolve(payment);
};

/**
 * Open a refund on a payment: reserve the amount and append its record in one conditional write.
 *
 * A miss means another write moved `amountRefunded` between the caller's read and this one — so the
 * payment is re-read and the whole check runs again against what is really left, instead of
 * refunding from a stale figure. Each miss means someone else made progress, so it ends.
 *
 * @param payment - the payment as the caller read it
 * @param request - the amount (absent = everything left) and the reason
 * @returns the opened record and the payment after it, or `null` when nothing (or not that much)
 *   is left to refund
 */
const openRefund = (
    payment: PaymentDocument,
    request: RefundRequest
): Promise<OpenedRefund | null> => {
    const { currency, _id: paymentId, orderId, amountRefunded } = payment;
    const remaining = remainingOf(payment);
    const amount =
        request.amount === undefined ? remaining : toMinorUnits(request.amount, currency);
    if (amount <= 0 || amount > remaining) return Promise.resolve(null);

    const refundId = new Types.ObjectId();
    const refund = {
        _id: refundId,
        amount: toDecimalAmount(amount, currency),
        currency,
        status: 'pending' as const,
        reason: request.reason,
        ...(request.returnId ? { returnId: request.returnId } : {}),
        // One key per RECORD, not per payment: two different partial refunds must not be taken
        // for one by the provider, while a retry of this one must be.
        idempotencyKey: `refund:${String(paymentId)}:${String(refundId)}`
    };
    const newTotal = addMoney(toMinorUnits(amountRefunded, currency), amount);

    return paymentRepository
        .addRefund(String(paymentId), amountRefunded, toDecimalAmount(newTotal, currency), refund)
        .then((updated) => {
            // `createdAt` is stamped by mongoose on insert; the record this write appended is
            // otherwise exactly `refund` — one cast for the one field the compiler cannot see.
            if (updated) return { payment: updated, refund: refund as RefundRecord };
            return paymentRepository
                .findByOrderId(String(orderId))
                .then((fresh) =>
                    fresh?.status === REFUNDABLE_PAYMENT_STATUS ? openRefund(fresh, request) : null
                );
        });
};

/**
 * Whether every unit of a payment has gone back: the records add up to `amount`, and none is
 * still open.
 * @param payment - the payment, after a refund just settled
 */
const isFullyRefunded = (payment: PaymentDocument): boolean =>
    remainingOf(payment) === 0 && payment.refunds.every((refund) => refund.status === 'succeeded');

/**
 * Tell `orders` where the money stands now, so its `paymentStatus` reads right without `orders`
 * ever asking here. Fire-and-forget: a projection is a report, and a failed one must not undo a
 * refund that already went back — the next refund stamps it again.
 * @param payment - the payment after a refund settled
 */
const reportRefundedToOrder = (payment: PaymentDocument): void => {
    // Started inside a promise so a synchronous throw (a malformed id) is reported, not raised.
    void Promise.resolve()
        .then(() =>
            orderService.markPaymentStatus(
                String(payment.orderId),
                payment.status === 'refunded' ? 'refunded' : 'partially_refunded'
            )
        )
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: could not report the refund state to order ${String(payment.orderId)}`,
                error
            });
            // Stryker restore all
        });
};

/**
 * Tell the buyer their money went back, when it went back outside a return — a refund that
 * followed a cancel, or an operator's goodwill one. A return's refund is announced by `returns`'
 * own closing notice, so one carrying a `returnId` is skipped here, as is a refund that moved no
 * money. Fire-and-forget, same reasoning as the `orderPaid` mail in `./settlement.ts`: a mail that
 * cannot be sent must never undo a refund that already went back.
 *
 * @param payment - the payment after the refund settled
 * @param refund - the record that settled
 */
const mailRefundIssued = (payment: PaymentDocument, refund: RefundRecord): void => {
    if (refund.returnId) return;

    const orderId = String(payment.orderId);
    // Started inside a promise so a synchronous throw (a malformed id) is reported, not raised.
    void Promise.resolve()
        .then(() => orderService.getById(orderId))
        .then((order) =>
            order
                ? mailBuyer(order, (locale, name) => {
                      const mail = refundIssuedEmail(
                          locale,
                          name,
                          order.orderNumber ?? orderId,
                          { amount: refund.amount, currency: refund.currency },
                          payment.status === 'refunded'
                      );
                      void enqueueEmail(
                          { to: order.email, subject: mail.subject },
                          mail.template,
                          mail.data
                      );
                  })
                : undefined
        )
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: could not mail the refund notice for order ${orderId}`,
                error
            });
            // Stryker restore all
        });
};

/**
 * Tell the rest of the system a refund landed: the log line, the audit row and the buyer's mail.
 * The `payment.refunded` fact itself is not here: it is written with the settlement
 * ({@link settleRefund}), so it exists exactly when the refund settled.
 *
 * @param payment - the payment after the refund settled
 * @param refund - the record that settled
 * @param context - present only for the admin request; audited only then
 * @param outcome - `failure` when the status moved but no money actually went back
 */
const announceRefund = (
    payment: PaymentDocument,
    refund: RefundRecord,
    context: CallerContext | undefined,
    outcome: 'success' | 'failure'
): void => {
    const orderId = String(payment.orderId);
    // Stryker disable all
    logger.info(
        outcome === 'success'
            ? `Payment for order ${orderId} refunded (${refund.amount} of ${payment.amount} ${payment.currency})`
            : `Payment for order ${orderId} marked refunded with no money actually returned — see the error logged just before this`
    );
    // Stryker restore all
    recordAudit(context, {
        action: paymentsAuditActions.ADMIN_PAYMENT_REFUNDED,
        outcome,
        target_type: 'order',
        target_id: orderId,
        metadata: { refundId: String(refund._id), amount: refund.amount }
    });
    reportRefundedToOrder(payment);
    if (outcome === 'success') mailRefundIssued(payment, refund);
};

/**
 * The `payment.refunded` payload for one settled refund — the fact `invoicing` issues a credit note
 * from and `webhooks` fans out. Built even for the corrupted-row case (`outcome: 'failure'`):
 * `invoicing` cannot see that distinction, and a credit note is owed either way.
 *
 * @param payment - the payment after the refund settled
 * @param refund - the record that settled
 */
const refundedPayload = (
    payment: PaymentDocument,
    refund: RefundRecord
): DomainEventMap['payment.refunded'] => ({
    paymentId: String(payment._id),
    orderId: String(payment.orderId),
    refundId: String(refund._id),
    ...(refund.returnId ? { returnId: refund.returnId } : {}),
    amount: refund.amount,
    currency: refund.currency,
    full:
        toMinorUnits(refund.amount, refund.currency) ===
        toMinorUnits(payment.amount, payment.currency)
});

/**
 * The settlement's writes, inside the caller's transaction: the refund record goes `succeeded`,
 * and the payment moves to `refunded` when that was the last of it.
 *
 * @param payment - the payment the refund belongs to
 * @param refund - the record being settled
 * @param fields - see {@link settleRefund}
 * @param session - the transaction both writes join
 * @returns the payment as it now stands, or `null` when the record was no longer open
 */
const writeSettlement = (
    payment: PaymentDocument,
    refund: RefundRecord,
    fields: { providerRefundRef?: string; refundedByHand?: true },
    session: ClientSession
): Promise<PaymentDocument | null> =>
    paymentRepository
        .settleRefund(String(payment._id), String(refund._id), fields, session)
        .then((settled) => {
            if (!settled) return null;
            if (!isFullyRefunded(settled)) return settled;
            return paymentRepository
                .updateStatusIfIn(
                    String(settled.orderId),
                    [REFUNDABLE_PAYMENT_STATUS],
                    'refunded',
                    {},
                    session
                )
                .then((moved) => moved ?? settled);
        });

/**
 * Settle one open refund, and move the payment to `refunded` if that was the last of it. The
 * conditional write IS the idempotence: a second caller (the sweep racing the request) finds the
 * record already `succeeded` and answers `null`, so the announcement fires once. The
 * `payment.refunded` outbox row commits with the writes, never after them.
 *
 * @param payment - the payment the refund belongs to
 * @param refund - the record being settled
 * @param fields - the provider's refund id, or `refundedByHand` for an operator's own report
 * @param context - present only for the admin request
 * @param outcome - `failure` for the corrupted-row case
 * @returns the payment as it now stands, or `null` when another caller settled it first
 */
const settleRefund = (
    payment: PaymentDocument,
    refund: RefundRecord,
    fields: { providerRefundRef?: string; refundedByHand?: true },
    context: CallerContext | undefined,
    outcome: 'success' | 'failure' = 'success'
): Promise<PaymentDocument | null> =>
    announceInTransaction(
        (session) => writeSettlement(payment, refund, fields, session),
        (final) => ({
            name: PAYMENT_REFUNDED,
            payload: refundedPayload(final, refund),
            aggregateId: String(final.orderId)
        })
    ).then((final) => {
        if (final) announceRefund(final, refund, context, outcome);
        return final;
    });

/**
 * Ask the provider to return one refund's money, and record its answer. A refusal marks the record
 * `failed` and rethrows, so the caller (the `ORDER_REFUND_OWED` listener) keeps its own retry
 * marker and the sweep finds the record open.
 *
 * @param payment - the payment (never `manual`, never without a `providerRef`)
 * @param refund - the record to send
 * @param providerRef - the provider's own id for the payment
 * @param context - present only for the admin request
 */
const sendToProvider = (
    payment: PaymentDocument,
    refund: RefundRecord,
    providerRef: string,
    context: CallerContext | undefined
): Promise<PaymentDocument | null> =>
    providerNamed(payment.provider)
        .refund(
            providerRef,
            { amount: refund.amount, currency: refund.currency },
            { idempotencyKey: refund.idempotencyKey }
        )
        .then(
            ({ refundRef }) =>
                settleRefund(payment, refund, { providerRefundRef: refundRef }, context),
            (error: unknown) =>
                paymentRepository
                    .failRefund(
                        String(payment._id),
                        String(refund._id),
                        (error instanceof Error ? error.message : String(error)).slice(
                            0,
                            MAX_ERROR_LENGTH
                        )
                    )
                    .then(() => {
                        throw error;
                    })
        );

/**
 * Carry one open refund to its end: settle it by hand, log the impossible row, or ask the provider.
 *
 * @param payment - the payment the refund belongs to
 * @param refund - the record to carry through
 * @param context - present only for the admin request. Also what tells a hand-paid refund apart
 *   from the automatic path: only the operator's own call may say the cash went back
 * @returns the payment after the refund settled, or `null` when it did not settle here
 */
const attemptRefund = (
    payment: PaymentDocument,
    refund: RefundRecord,
    context: CallerContext | undefined
): Promise<PaymentDocument | null> => {
    // Money recorded by hand has no provider to ask.
    if (payment.provider === 'manual')
        return context
            ? settleRefund(payment, refund, { refundedByHand: true }, context)
            : Promise.resolve(null);

    if (!payment.providerRef) {
        // Only a `succeeded` payment reaches here, and nothing can succeed before the provider
        // has been asked for an intent — so this is a corrupted row, not a reachable state. Loud,
        // and the record still settles: leaving it open would invite a second attempt at the same
        // impossible refund.
        // Stryker disable all
        logger.error({
            message: 'Refunded a payment carrying no provider reference — money was NOT returned.',
            orderId: String(payment.orderId)
        });
        // Stryker restore all
        return settleRefund(payment, refund, {}, context, 'failure');
    }

    return sendToProvider(payment, refund, payment.providerRef, context);
};

/**
 * Finish every refund a payment still has open — the same records, the same idempotency keys, so a
 * provider that already returned the money answers with the refund it already made.
 *
 * @param payment - the payment
 * @param context - present only for the admin request
 * @returns the payment after the last one, and whether any settled here
 */
export const settleOpenRefunds = async (
    payment: PaymentDocument,
    context?: CallerContext
): Promise<{ payment: PaymentDocument; settled: boolean }> => {
    let current = payment;
    let settled = false;

    for (const refund of payment.refunds) {
        if (refund.status === 'succeeded') continue;
        const after = await attemptRefund(current, refund, context);
        if (!after) continue;
        current = after;
        settled = true;
    }

    return { payment: current, settled };
};

/**
 * Refund an order's payment — the operator action, and the listener's compensation.
 *
 * Any refund still open is finished first, so a retried cancel completes the refund it already
 * started instead of opening a second one for the same money.
 *
 * @param orderId - the order whose payment is being returned
 * @param context - present only for the admin request (`refundByOrder`); the `ORDER_REFUND_OWED`
 *  listener (`refundForOrder`) has none. Also what tells a hand-paid refund apart from the two
 *  callers: present means the operator asked (audited `success`), absent means the automatic
 *  listener did (left for an operator, audited `PAYMENT_REFUND_OWED_BY_HAND` instead).
 * @param request - the amount and the reason; omitted, it is everything left, for a cancellation
 * @returns the payment as it now stands — `refunded` once all of it is back, still `succeeded`
 *   after a partial refund or when a hand-paid refund is left for an operator — or `null` when
 *   there was nothing to return
 */
export const performRefund = (
    orderId: string,
    context?: CallerContext,
    request?: RefundRequest
): Promise<PaymentDocument | null> =>
    paymentRepository.findByOrderId(orderId).then((payment) => {
        if (payment?.status !== REFUNDABLE_PAYMENT_STATUS) return null;

        // Only the operator's own call (`context` present) may say hand-paid cash went back; the
        // automatic listener leaves it standing.
        if (payment.provider === 'manual' && !context) return leaveForOperator(orderId, payment);

        return settleOpenRefunds(payment, context).then(({ payment: current, settled }) => {
            if (remainingOf(current) <= 0) return settled ? current : null;

            return openRefund(current, request ?? CANCELLATION_REQUEST).then((opened) =>
                opened ? attemptRefund(opened.payment, opened.refund, context) : null
            );
        });
    });

/**
 * The 422 an operator's amount earns, if any — checked against the payment BEFORE anything is
 * written, so a wrong number never opens a record.
 *
 * @param payment - the payment the refund is for
 * @param body - the request's `amount` and `currency`
 * @returns the refusal, or `undefined` when the request is fine
 */
const refusalFor = (
    payment: PaymentDocument,
    body: { amount?: number; currency?: string }
): ResponseReject | undefined => {
    const { amount, currency } = body;
    if (currency !== undefined && currency !== payment.currency)
        return generateReject(422, [t('payments.refund-currency-mismatch')]);
    if (amount === undefined) return undefined;

    const minor = toMinorUnits(amount, payment.currency);
    // A decimal the currency has no minor unit for (0.001 EUR) would round to a different amount
    // than the one the operator typed — refused rather than quietly changed.
    if (toDecimalAmount(minor, payment.currency) !== amount)
        return generateReject(422, [t('payments.refund-invalid-amount')]);
    if (payment.status === REFUNDABLE_PAYMENT_STATUS && minor > remainingOf(payment))
        return generateReject(422, [
            {
                code: ERROR_CODES.PAYMENT_REFUND_EXCEEDS_REMAINING,
                message: t('payments.refund-exceeds-remaining')
            }
        ]);
    return undefined;
};

/**
 * `POST /payments/order/:orderId/refund` — the operator returning money on its own, separate
 * from cancelling. Admin-only at the route.
 *
 * @param orderId - the order whose payment is being returned
 * @param authContext - the caller, for the read that distinguishes 404 from 409
 * @param context - the caller context to audit the refund against
 * @param body - the optional `amount` (absent = everything left) and its `currency`
 * @returns the payment as it now stands, or a refusal naming which case it was
 */
export const refundByOrder = (
    orderId: string,
    authContext: AuthContext | undefined,
    context: CallerContext,
    body: { amount?: number; currency?: string } = {}
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
    paymentRepository.findByOrderId(orderId, callerScope(authContext)).then((payment) => {
        if (!payment) return generateReject(404, [t('payments.not-found')]);

        const invalid = refusalFor(payment, body);
        if (invalid) return invalid;

        return performRefund(orderId, context, { amount: body.amount, reason: 'goodwill' }).then(
            (refunded) =>
                refunded
                    ? generateSuccess(refunded, 200, t('payments.refund-success'))
                    : generateReject(409, [
                          {
                              code: ERROR_CODES.PAYMENT_NOT_REFUNDABLE,
                              message: t('payments.not-refundable')
                          }
                      ])
        );
    });

/**
 * `ORDER_REFUND_OWED`'s listener: give the money back if any was taken.
 *
 * Idempotent: a second event, or a cancel of a never-paid order, finds nothing left to return and
 * does nothing. Unattended, so a real PSP refund's outcome is only logged — but a hand-paid order
 * still gets its own audit row (`leaveForOperator`), since that one needs a human to act on it.
 *
 * @param orderId - the order that was cancelled
 */
export const refundForOrder = (orderId: string): Promise<void> =>
    performRefund(orderId).then(() => undefined);

/**
 * Give back the money for goods a customer returned — `returns`' one door into the refund. The
 * amount is clamped to what the payment still has left, so a goodwill refund made earlier can
 * never make a return over-refund; the refund is recorded as `return` and carries `returnId`, so
 * `returns` can close the return when the money lands — now, or later when the sweep finishes it.
 *
 * A provider refusal throws after the refund is recorded as `failed`: the sweep will retry it and
 * `returns` will hear of it then.
 *
 * @param orderId - the returned order
 * @param input - which return this pays for, and how much (a decimal in the payment's currency)
 * @param context - the staff member who received the goods, audited on the refund
 * @returns the payment as it now stands, or `null` when there is nothing to return — no succeeded
 *   payment, nothing left of it, or a zero amount
 */
export const refundForReturn = (
    orderId: string,
    input: { returnId: string; amount: number },
    context: CallerContext
): Promise<PaymentDocument | null> =>
    paymentRepository.findByOrderId(orderId).then((payment) => {
        if (payment?.status !== REFUNDABLE_PAYMENT_STATUS) return null;

        const wanted = toMinorUnits(input.amount, payment.currency);
        // `Math.min` returns a plain number; both operands are `Money`, so the result still is.
        const amount = Math.min(wanted, remainingOf(payment)) as Money;
        if (amount <= 0) return null;

        return performRefund(orderId, context, {
            amount: toDecimalAmount(amount, payment.currency),
            reason: 'return',
            returnId: input.returnId
        });
    });
