/**
 * @module
 * Retry the one effect a `succeeded` write can leave owing — the stock commit — when the process
 * died between setting `pendingEffects` and clearing it (B14). `scripts/ops/sweep-payment-effects.ts`
 * is the only caller; `settlement.ts` sets and clears the marker itself on the normal path, so this
 * is purely the crash-recovery half.
 */

import { logger } from '@infrastructure/adapters/logger';
import { orderService } from '@modules/orders';
import { inventoryService } from '@modules/inventory';
import { OrderStatus } from '@types';
import { paymentRepository } from '../repository';
import type { PaymentDocument } from '../model';

/** How many payments one sweep pass retries before asking to be run again. */
const SWEEP_BATCH_SIZE = 200;

/**
 * A marker at least this old is safe to act on — younger than that, it may belong to a settlement
 * still between its two writes, and the sweep exists for the crash case, not to race the normal
 * one. Generous next to the 5-minute schedule: even a slow settlement finishes in seconds.
 */
const MIN_MARKER_AGE_MINUTES = 1;

/**
 * Order statuses whose payment has (or should have) already taken the held stock — the commit is
 * safe to repeat (B15's exactly-once claim on the hold), so a payment the settlement itself
 * already committed just has its marker cleared here for free.
 */
const STOCK_TAKEN_STATUSES: ReadonlySet<OrderStatus> = new Set([
    OrderStatus.paid,
    OrderStatus.processing,
    OrderStatus.shipped,
    OrderStatus.delivered
]);

/**
 * Finish one payment's owed effect, or drop the marker if its order can no longer use it.
 *
 * A cancelled (or otherwise gone) order means the settlement's order-lost branch already ran, or
 * ran and died before clearing the marker — either way there is nothing left to commit, only the
 * note to clear.
 *
 * @param payment - a payment whose `pendingEffects` names `commit`
 */
const retryOne = (payment: PaymentDocument): Promise<void> => {
    const orderId = String(payment.orderId);
    return orderService.getById(orderId).then((order) => {
        const stockStillOwed = order !== undefined && STOCK_TAKEN_STATUSES.has(order.status);
        return (stockStillOwed ? inventoryService.commitForOrder(orderId) : Promise.resolve(false))
            .then(() => paymentRepository.clearPendingEffects(orderId))
            .catch((error: unknown) => {
                // Stryker disable all
                logger.error({
                    message: `Payments: could not retry the pending effect for order ${orderId} — it stays marked, and the next sweep tries again`,
                    error
                });
                // Stryker restore all
            });
    });
};

/**
 * Sweep every payment whose settlement died before it could commit stock or clear its marker.
 *
 * @returns how many payments were swept
 */
export const retryPendingEffects = (): Promise<number> => {
    const cutoff = new Date(Date.now() - MIN_MARKER_AGE_MINUTES * 60_000);
    return paymentRepository
        .findWithPendingEffects(cutoff, SWEEP_BATCH_SIZE)
        .then((payments) =>
            Promise.all(payments.map((payment) => retryOne(payment))).then(() => payments.length)
        );
};
