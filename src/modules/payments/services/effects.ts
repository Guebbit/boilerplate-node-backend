/**
 * @module
 * The sweeps that finish what a settlement left owing: open refunds the provider refused or never
 * answered, and payments whose provider decided without telling us (the net under a lost webhook).
 * Shaped like `orders/services/cancel.ts`'s own sweep: sequential, warns on a full batch, and
 * returns how many actually settled.
 */

import { logger } from '@infrastructure/adapters/logger';
import { paymentRepository } from '../repository';
import type { PaymentDocument } from '../model';
import { paymentEffectRetryMinutes, paymentReconcileMinutes } from '../config';
import { settleOpenRefunds } from './refunds';
import { settleFromProvider } from './settlement';

/** How many payments one sweep pass retries before asking to be run again. */
const SWEEP_BATCH_SIZE = 200;

/**
 * The skeleton both sweeps share: find the payments due, handle each one in turn, warn when the
 * batch was full so a truncated run is not read as done.
 *
 * @param find - reads one batch of payments untouched since the cutoff
 * @param handle - settles one payment; resolves whether it did, and never rejects
 * @param label - which sweep this is, for its log lines
 * @param graceMinutes - how long a payment sits untouched before this sweep may act on it
 * @returns how many payments were settled
 */
const sweepDue = async (
    find: (cutoff: Date, limit: number) => Promise<PaymentDocument[]>,
    handle: (payment: PaymentDocument) => Promise<boolean>,
    label: 'refund' | 'reconcile',
    graceMinutes: number
): Promise<number> => {
    const cutoff = new Date(Date.now() - graceMinutes * 60_000);
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
    sweepDue(
        paymentRepository.findWithOpenRefunds,
        retryOneRefund,
        'refund',
        paymentEffectRetryMinutes()
    );

/**
 * Ask the provider about one stale payment and settle the answer; a failure is logged and leaves
 * the payment for the next sweep.
 *
 * @param payment - an unsettled payment holding a provider intent
 * @returns whether this call's own write moved the payment (a call that lost a race, or found the
 *   provider still undecided, did not)
 */
const reconcileOne = (payment: PaymentDocument): Promise<boolean> =>
    settleFromProvider(payment)
        .then(
            (settlement) =>
                settlement?.transitioned === true && payment.status !== settlement.payment.status
        )
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: could not reconcile order ${String(payment.orderId)}'s payment with the provider — it stays as it is, and the next sweep asks again`,
                error
            });
            // Stryker restore all
            return false;
        });

/**
 * Reconcile every unsettled payment the provider may have decided without telling us — the net
 * under a lost webhook, the standard fix. The settlement is the same one the webhook, the confirm
 * and the sync reach, so a payment the webhook DID deliver is a harmless no-op here: every write
 * in it is conditional, and a settled payment is not asked about at all.
 *
 * @returns how many payments moved to a new state
 */
export const reconcileStalePayments = (): Promise<number> =>
    sweepDue(
        paymentRepository.findStaleInFlight,
        reconcileOne,
        'reconcile',
        paymentReconcileMinutes()
    );
