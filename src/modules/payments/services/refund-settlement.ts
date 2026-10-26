/**
 * @module
 * How a refund record ends: the writes that settle it (`succeeded`, with the order stamped and
 * `payment.refunded` in the outbox) or record that the provider refused it. Split from `refunds.ts`
 * so the flows that reach a record from the provider's side (`./refund-sync.ts`) and the flows that
 * send one (`./refunds.ts`) share these without importing each other.
 */

import type { ClientSession } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { RefundFailureReason, RefundStatus, type CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import type { DomainEventMap } from '@kernel/events';
import { announceInTransaction } from '@kernel/outbox';
import { toMinorUnits, subtractMoney, type Money } from '@domain-primitives/money';
import { orderService } from '@modules/orders';
import { ownOrderFlag } from '@modules/access';
import { paymentsAuditActions } from '../audit';
import { paymentEffectRetryMinutes } from '../config';
import { paymentRepository } from '../repository';
import { PAYMENT_REFUNDED, PAYMENT_REFUND_FAILED, PAYMENT_REFUND_REVERSED } from '../events';
import type { PaymentDocument, RefundRecord, RefundSettlement } from '../model';
import { isFinalFailure, isOpenRefund, nextRefundAttemptAt, OPEN_REFUND_STATUSES } from '../domain';

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
 * What a refund's timeline rows carry: its id, the money and the closed reason code. Never the
 * provider's wording.
 *
 * @param refund - the refund record
 */
export const refundRow = (
    refund: Pick<RefundRecord, '_id' | 'amount' | 'currency' | 'reason'>
): Record<string, string | number> => ({
    refundId: String(refund._id),
    amount: refund.amount,
    currency: refund.currency,
    reason: refund.reason
});

/**
 * Whether every unit of a payment has gone back: the records add up to `amount`, and none is
 * still open.
 * @param payment - the payment, after a refund just settled
 */
export const isFullyRefunded = (payment: PaymentDocument): boolean =>
    remainingOf(payment) === 0 && payment.refunds.every((refund) => !isOpenRefund(refund));

/**
 * Tell the rest of the system a refund landed: the log line and the audit row.
 * The `payment.refunded` fact itself is not here: it is written with the settlement
 * ({@link settleRefund}), so it exists exactly when the refund settled.
 *
 * @param payment - the payment after the refund settled
 * @param refund - the record that settled
 * @param context - present only for the admin request; audited only then
 * @param outcome - `failure` when the status moved but no money actually went back
 * @param byHand - the operator confirmed hand-paid money returned (`settleRefundByHand`)
 */
export const announceRefund = (
    payment: PaymentDocument,
    refund: RefundRecord,
    context: CallerContext | undefined,
    outcome: 'success' | 'failure',
    byHand: boolean
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
        action: byHand
            ? paymentsAuditActions.ADMIN_PAYMENT_REFUND_SETTLED_BY_HAND
            : paymentsAuditActions.ADMIN_PAYMENT_REFUNDED,
        outcome,
        targetType: 'order',
        targetId: orderId,
        metadata: {
            refundId: String(refund._id),
            amount: refund.amount,
            ...ownOrderFlag(context, payment.userId?.toString())
        }
    });
};

/**
 * The `payment.refunded` payload for one settled refund — the fact `invoicing` issues a credit note
 * from and `webhooks` fans out. Built even for the corrupted-row case (`outcome: 'failure'`):
 * `invoicing` cannot see that distinction, and a credit note is owed either way.
 *
 * @param payment - the payment after the refund settled
 * @param refund - the record that settled
 */
export const refundedPayload = (
    payment: PaymentDocument,
    refund: RefundRecord
): DomainEventMap['payment.refunded'] => ({
    paymentId: String(payment._id),
    orderId: String(payment.orderId),
    refundId: String(refund._id),
    ...(refund.returnId ? { returnId: refund.returnId } : {}),
    ...(refund.lines?.length
        ? {
              goods: {
                  lines: refund.lines.map(({ productId, quantity }) => ({ productId, quantity })),
                  shipping: refund.shipping ?? 0
              }
          }
        : {}),
    amount: refund.amount,
    currency: refund.currency,
    full:
        toMinorUnits(refund.amount, refund.currency) ===
        toMinorUnits(payment.amount, payment.currency)
});

/**
 * Tell `orders` where the money stands now, so its `paymentStatus` reads right without `orders`
 * ever asking here. Part of the settlement's transaction, not a report after it: nothing later
 * repairs a missed stamp after the last refund, so it commits with the settlement or not at all.
 *
 * @param payment - the payment after the refund settled
 * @param session - the settlement's transaction
 */
export const stampOrder = (payment: PaymentDocument, session: ClientSession): Promise<boolean> =>
    orderService.markPaymentStatus(
        String(payment.orderId),
        isFullyRefunded(payment) ? 'refunded' : 'partially_refunded',
        session
    );

/**
 * The settlement's writes, inside the caller's transaction: the refund record goes `succeeded`,
 * and the order's payment status is stamped to match (`refunded` when that was the last of it).
 *
 * @param payment - the payment the refund belongs to
 * @param refund - the record being settled
 * @param fields - see {@link settleRefund}
 * @param session - the transaction both writes join
 * @param actor - the operator who settled it by hand, when one did
 * @returns the payment as it now stands, or `null` when the record was no longer open
 */
export const writeSettlement = (
    payment: PaymentDocument,
    refund: RefundRecord,
    fields: RefundSettlement,
    session: ClientSession,
    actor?: string | null
): Promise<PaymentDocument | null> =>
    paymentRepository
        .settleRefund(String(payment._id), String(refund._id), fields, session)
        .then((final) =>
            final
                ? stampOrder(final, session)
                      .then(() =>
                          orderService.appendTimeline(
                              String(final.orderId),
                              { type: 'refund_settled', actor, data: refundRow(refund) },
                              session
                          )
                      )
                      .then(() => final)
                : null
        );

/**
 * Settle one open refund. The
 * conditional write IS the idempotence: a second caller (the sweep racing the request) finds the
 * record already `succeeded` and answers `null`, so the announcement fires once. The
 * `payment.refunded` outbox row commits with the writes, never after them.
 *
 * @param payment - the payment the refund belongs to
 * @param refund - the record being settled
 * @param fields - the provider's refund id, or `settledByHand` for an operator's own report
 * @param context - present only for the admin request
 * @param outcome - `failure` for the corrupted-row case
 * @returns the payment as it now stands, or `null` when another caller settled it first
 */
export const settleRefund = (
    payment: PaymentDocument,
    refund: RefundRecord,
    fields: RefundSettlement,
    context: CallerContext | undefined,
    outcome: 'success' | 'failure' = 'success'
): Promise<PaymentDocument | null> =>
    announceInTransaction(
        (session) => writeSettlement(payment, refund, fields, session, context?.caller.id),
        (final) => ({
            name: PAYMENT_REFUNDED,
            payload: refundedPayload(final, refund),
            aggregateId: String(final.orderId)
        })
    ).then((final) => {
        if (final) announceRefund(final, refund, context, outcome, fields.settledByHand === true);
        return final;
    });

/**
 * Whether a refusal is worth a timeline row: the first one, or one for a different reason than the
 * last. The sweep retries a stuck refund every few minutes, and a row each time would bury the rest.
 *
 * @param refund - the record as it was read before this refusal
 * @param failureReason - the closed code for what the provider said now
 */
export const isNewFailure = (refund: RefundRecord, failureReason: RefundFailureReason): boolean =>
    (refund.attempts ?? 0) === 0 || refund.failureReason !== failureReason;

/**
 * The `payment.refund_failed` payload: the record, the closed reason, and whether it ends the retrying.
 *
 * @param payment - the payment
 * @param refund - the record that failed
 * @param failureReason - the closed code
 * @param final - whether the refusal ends the retrying
 */
const failedPayload = (
    payment: PaymentDocument,
    refund: RefundRecord,
    failureReason: RefundFailureReason,
    final: boolean
): DomainEventMap['payment.refund_failed'] => ({
    paymentId: String(payment._id),
    orderId: String(payment.orderId),
    refundId: String(refund._id),
    amount: refund.amount,
    currency: refund.currency,
    failureReason,
    final
});

/**
 * Record that the provider refused a refund: the record goes `failed` (counting the attempt) and,
 * when the refusal is news ({@link isNewFailure}), the order's timeline says so and
 * `payment.refund_failed` is announced, in one transaction. Only the current attempt can fail it,
 * so a late error never walks back a refund that already succeeded or overwrites a newer attempt,
 * and writes no row.
 *
 * @param payment - the payment
 * @param refund - the record the provider refused, as it was read
 * @param failureReason - the closed code for what it said
 */
export const recordRefundFailure = (
    payment: PaymentDocument,
    refund: RefundRecord,
    failureReason: RefundFailureReason
): Promise<void> => {
    const attempts = (refund.attempts ?? 0) + 1;
    return announceInTransaction(
        (session) =>
            paymentRepository
                .failRefund(
                    String(payment._id),
                    String(refund._id),
                    {
                        reason: failureReason,
                        // `attemptedAt` is always there on a record this code opened or claimed.
                        attempt: refund.attemptedAt!,
                        nextAttemptAt: nextRefundAttemptAt(
                            failureReason,
                            attempts,
                            paymentEffectRetryMinutes(),
                            new Date()
                        )
                    },
                    session
                )
                .then((failed) =>
                    // A repeat of the last refusal writes the record and says nothing.
                    failed && isNewFailure(refund, failureReason)
                        ? orderService
                              .appendTimeline(
                                  String(payment.orderId),
                                  {
                                      type: 'refund_failed',
                                      data: { ...refundRow(refund), failureReason }
                                  },
                                  session
                              )
                              .then(() => failed)
                        : null
                ),
        (failed) => ({
            name: PAYMENT_REFUND_FAILED,
            payload: failedPayload(failed, refund, failureReason, isFinalFailure(failureReason)),
            aggregateId: String(failed.orderId)
        })
    ).then(() => undefined);
};

/**
 * Where the order's payment stamp stands once a settled refund was taken back: partly refunded
 * while another refund still stands, otherwise cleared so the order reads `paid` again.
 *
 * @param payment - the payment after the reversal
 */
const stampAfterReversal = (payment: PaymentDocument): 'partially_refunded' | undefined =>
    payment.refunds.some((refund) => refund.status === RefundStatus.succeeded)
        ? 'partially_refunded'
        : undefined;

/**
 * The reversal's writes, inside the caller's transaction: the record goes `failed` with
 * `reversedAt`, then (for a refund that had settled) the order is re-stamped and the timeline says
 * so; for one that was still open, the timeline records the provider's refusal.
 *
 * @param payment - the payment as read
 * @param refund - the record, as read
 * @param reason - the closed reason the provider gave
 * @param session - the transaction every write joins
 * @returns the payment after the write, or `null` when the record was not reversible any more
 */
const writeReversal = (
    payment: PaymentDocument,
    refund: RefundRecord,
    reason: RefundFailureReason,
    session: ClientSession
): Promise<PaymentDocument | null> => {
    const wasSettled = refund.status === RefundStatus.succeeded;
    return paymentRepository
        .reverseRefund(
            String(payment._id),
            String(refund._id),
            { reason, from: wasSettled ? [RefundStatus.succeeded] : OPEN_REFUND_STATUSES },
            session
        )
        .then((final) => {
            if (!final) return null;
            const stamp = wasSettled
                ? orderService.markPaymentStatus(
                      String(final.orderId),
                      stampAfterReversal(final),
                      session
                  )
                : Promise.resolve(true);
            return stamp
                .then(() =>
                    orderService.appendTimeline(
                        String(final.orderId),
                        {
                            type: wasSettled ? 'refund_reversed' : 'refund_failed',
                            data: { ...refundRow(refund), failureReason: reason }
                        },
                        session
                    )
                )
                .then(() => final);
        });
};

/**
 * The provider says this refund failed: a settled one was taken back (a bank sent the money back),
 * an open one was refused by the provider itself. Either way the record is owed another way and is
 * never sent again. The write is conditional and sets `reversedAt` once, so a redelivered report
 * changes nothing and announces nothing.
 *
 * Announces `payment.refund_reversed` for a settled record and `payment.refund_failed` (final) for
 * an open one. The credit note and a closed return stay either way.
 *
 * @param payment - the payment as read
 * @param refund - the record, as read
 * @param reason - the closed reason the provider gave
 * @returns the payment after the reversal, or `null` when nothing changed
 */
export const reverseRefund = (
    payment: PaymentDocument,
    refund: RefundRecord,
    reason: RefundFailureReason
): Promise<PaymentDocument | null> => {
    const wasSettled = refund.status === RefundStatus.succeeded;
    return announceInTransaction(
        (session) => writeReversal(payment, refund, reason, session),
        (final) =>
            wasSettled
                ? {
                      name: PAYMENT_REFUND_REVERSED,
                      payload: {
                          paymentId: String(final._id),
                          orderId: String(final.orderId),
                          refundId: String(refund._id),
                          amount: refund.amount,
                          currency: refund.currency,
                          failureReason: reason
                      },
                      aggregateId: String(final.orderId)
                  }
                : {
                      name: PAYMENT_REFUND_FAILED,
                      payload: failedPayload(final, refund, reason, true),
                      aggregateId: String(final.orderId)
                  }
    );
};
