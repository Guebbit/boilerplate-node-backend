/**
 * @module
 * Announcing a settled payment. `PAYMENT_SUCCEEDED` goes through the transactional outbox, so it
 * is durable from the moment the settlement's last owed effect is discharged — a crash after the
 * money moved cannot leave subscribers never hearing about it. `PAYMENT_FAILED` rides the
 * same outbox, written with the `declined` status move itself.
 *
 * Reached from two places that must agree: `./settlement.ts` (the normal path) and `./effects.ts`
 * (the sweep that finishes a settlement which died after charging).
 *
 * See: docs/tools/outbox.md
 */

import { withTransaction } from '@infrastructure/runtime/database';
import { announceInTransaction, enqueueOutboxEvent, nudgeOutbox } from '@kernel/outbox';
import { PAYMENT_FAILED, PAYMENT_SUCCEEDED } from '../events';
import { SETTLEABLE_PAYMENT_STATUSES } from '../domain';
import type { PaymentDocument } from '../model';
import { paymentRepository } from '../repository';

/**
 * Discharge the payment's owed-effects marker and announce `payment.succeeded`, atomically.
 *
 * The marker is the durable "this settlement is not finished" note. Clearing it and writing the
 * outbox row are one transaction, so the announcement exists exactly when the marker is gone: a
 * crash before leaves the marker for the sweep, a crash after leaves the row for the relay.
 * Only the caller whose clear actually removed the marker enqueues, so a settlement racing the
 * sweep announces once, not twice.
 *
 * @param paymentId - the settled payment
 * @param orderId - its order, which is also the outbox aggregate (per-order ordering)
 * @returns whether this call wrote the announcement
 */
export const announcePaymentSucceeded = (paymentId: string, orderId: string): Promise<boolean> =>
    withTransaction((session) =>
        paymentRepository
            .clearPendingEffectsOnce(orderId, session)
            .then((cleared) =>
                cleared
                    ? enqueueOutboxEvent(
                          PAYMENT_SUCCEEDED,
                          { paymentId, orderId },
                          orderId,
                          session
                      ).then(() => true)
                    : false
            )
    ).then((announced) => {
        // After commit, never before: the relay must not see a row the transaction may still drop.
        if (announced) nudgeOutbox();
        return announced;
    });

/**
 * Move a payment to `declined` and announce `payment.failed`, atomically.
 *
 * The event row commits with the status write or not at all, so a decline that landed is always
 * announced and one that lost its race never is — a redelivered decline must not tell `webhooks`
 * the attempt happened twice.
 *
 * @param orderId - the order whose payment the provider declined
 * @param extra - the fields recorded beside the status (the provider's own reference, last error)
 * @returns the payment as it now stands, or `null` when another call already moved it
 */
export const recordDecline = (
    orderId: string,
    extra: Partial<PaymentDocument>
): Promise<PaymentDocument | null> =>
    announceInTransaction(
        (session) =>
            paymentRepository.updateStatusIfIn(
                orderId,
                SETTLEABLE_PAYMENT_STATUSES,
                'declined',
                extra,
                session
            ),
        (declined) => ({
            name: PAYMENT_FAILED,
            payload: { paymentId: String(declined._id), orderId },
            aggregateId: orderId
        })
    );
