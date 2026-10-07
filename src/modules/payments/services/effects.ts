/**
 * @module
 * Retry the one effect a `succeeded` write can leave owing — the stock commit, or, when the order
 * moved away before settlement's own `orderLost` branch could react, the refund it owes instead.
 * `scripts/ops/sweep-payment-effects.ts` is the only caller; `settlement.ts` sets and clears the
 * marker itself on the normal path, so this is purely the crash-recovery half. Shaped like
 * `orders/services/cancel.ts`'s own sweep: sequential, warns on a full batch, and returns how many
 * actually settled.
 */

import { logger } from '@infrastructure/adapters/logger';
import { orderService, stockCommitted } from '@modules/orders';
import { inventoryService } from '@modules/inventory';
import { paymentRepository } from '../repository';
import type { PaymentDocument } from '../model';
import { paymentEffectRetryMinutes } from '../config';
import { settleOpenRefunds } from './refunds';
import { announcePaymentSucceeded } from './announce';

/** How many payments one sweep pass retries before asking to be run again. */
const SWEEP_BATCH_SIZE = 200;

/**
 * Finish one payment's owed effect: commit the stock and announce `payment.succeeded` if the order
 * can still use it, mark a refund owed if the order moved on before settlement's own `orderLost`
 * branch could react, or just drop the marker if there is nothing left to do either way.
 *
 * @param payment - a payment whose `pendingEffects` names `commit`
 * @returns whether this payment's effect was discharged
 */
const retryOne = (payment: PaymentDocument): Promise<boolean> => {
    const orderId = String(payment.orderId);
    // Flattened into one chain, so a rejection anywhere along it — including `getById` itself —
    // reaches the single `.catch` below instead of escaping the loop this feeds.
    return orderService
        .getById(orderId)
        .then((order): Promise<unknown> => {
            // The settlement died after charging: commit the stock, then announce — the announce
            // clears the marker and writes `payment.succeeded` to the outbox in one transaction.
            if (order !== undefined && stockCommitted(order.status))
                return inventoryService
                    .commitForOrder(orderId)
                    .then(() => announcePaymentSucceeded(String(payment._id), orderId));

            // The order moved away before settlement's own `orderLost` branch could react — a
            // crash between writing `succeeded` and checking the order there. Nothing has marked
            // the refund owed yet, so do it here, before the marker clears. Nothing is announced:
            // the order never reached a paid state that stayed paid.
            return (
                payment.status === 'succeeded'
                    ? orderService.markRefundOwed(orderId)
                    : Promise.resolve()
            ).then(() => paymentRepository.clearPendingEffects(orderId));
        })
        .then(() => true)
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: could not retry the pending effect for order ${orderId} — it stays marked, and the next sweep tries again`,
                error
            });
            // Stryker restore all
            return false;
        });
};

/**
 * The skeleton both sweeps share: find the payments due, handle each one in turn, warn when the
 * batch was full so a truncated run is not read as done.
 *
 * @param find - reads one batch of payments untouched since the cutoff
 * @param handle - settles one payment; resolves whether it did, and never rejects
 * @param label - which sweep this is, for its log lines
 * @returns how many payments were settled
 */
const sweepDue = async (
    find: (cutoff: Date, limit: number) => Promise<PaymentDocument[]>,
    handle: (payment: PaymentDocument) => Promise<boolean>,
    label: 'effect' | 'refund'
): Promise<number> => {
    const cutoff = new Date(Date.now() - paymentEffectRetryMinutes() * 60_000);
    const due = await find(cutoff, SWEEP_BATCH_SIZE);

    let settled = 0;
    for (const payment of due) {
        if (await handle(payment)) settled += 1;
    }

    // A full batch means more is waiting. Said out loud, so a truncated run is not read as done.
    if (due.length === SWEEP_BATCH_SIZE)
        // Stryker disable all
        logger.warn(
            `Payment ${label} sweep: hit the ${SWEEP_BATCH_SIZE}-payment batch cap — run it again to continue`
        );
    // Stryker restore all

    if (due.length > 0)
        // Stryker disable next-line all
        logger.info(`Payment ${label} sweep: ${settled} of ${due.length} owed items settled`);

    return settled;
};

/**
 * Sweep every payment whose settlement died before it could commit stock, mark a refund owed, or
 * clear its marker.
 *
 * @returns how many payments were settled
 */
export const retryPendingEffects = (): Promise<number> =>
    sweepDue(paymentRepository.findWithPendingEffects, retryOne, 'effect');

/**
 * Retry one payment's open refunds; a failure is logged and leaves them open for the next sweep.
 *
 * @param payment - a payment with at least one refund still open
 * @returns whether at least one refund settled
 */
const retryOneRefund = (payment: PaymentDocument): Promise<boolean> =>
    settleOpenRefunds(payment)
        .then((outcome) => outcome.settled)
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: could not retry the open refund for order ${String(payment.orderId)} — it stays open, and the next sweep tries again`,
                error
            });
            // Stryker restore all
            return false;
        });

/**
 * Retry every refund the provider refused, or that died before it was answered — the refund half
 * of the sweep. The same records and the same idempotency keys are sent again, so a provider that
 * already returned the money answers with the refund it already made instead of returning it twice.
 *
 * A hand-paid refund is never finished here: only an operator's own call may say the cash went back.
 *
 * @returns how many payments had at least one refund settled
 */
export const retryOpenRefunds = (): Promise<number> =>
    sweepDue(paymentRepository.findWithOpenRefunds, retryOneRefund, 'refund');
