/**
 * @module
 * The expiry tick: every hold whose window has closed gives its units back.
 */

import { logger } from '@infrastructure/adapters/logger';
import { announceInTransaction } from '@kernel/outbox';
import { StockMovementReason } from '@types';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { reservationRepository } from '../repository';
import { RESERVATION_EXPIRED } from '../events';
import { inventoryAuditActions } from '../audit';
import { refreshStockCacheForOrder, releaseForOrder } from './holds';

/** How many holds one batch of a sweep reads and expires. */
const SWEEP_BATCH_SIZE = 200;

/**
 * Batches one sweep will drain before it stops, whatever is left: 50 x 200 = 10,000 holds. A bound
 * so a pathological backlog ends a run (the next tick continues) instead of outliving the job's
 * lease; a real backlog is a few hundred.
 */
const SWEEP_MAX_BATCHES = 50;

/**
 * Release one stale hold and announce it, as ONE transaction: the units come back and the
 * `RESERVATION_EXPIRED` event row is written together, or neither is.
 *
 * One transaction, so a crash cannot release a hold whose announcement is lost — that would leave
 * the order `pending`, still payable, with nothing set aside for it. Through the outbox the relay
 * retries the announcement until `orders` has heard it, and a redelivery is safe: the system actor
 * cancels only an order still `pending`.
 *
 * @param orderId - the order whose hold is stale
 * @returns whether this call was the one that released it
 */
const expireOne = (orderId: string): Promise<boolean> =>
    announceInTransaction(
        (session) =>
            releaseForOrder(orderId, StockMovementReason.expire, session).then((released) =>
                released ? { orderId } : null
            ),
        (written) => ({
            name: RESERVATION_EXPIRED,
            payload: written,
            aggregateId: written.orderId
        })
    ).then((written) =>
        // The catalogue's stock cache is written outside the transaction, so only after it commits.
        written === null ? false : refreshStockCacheForOrder(orderId).then(() => true)
    );

/**
 * Expire one stale hold, or log why it could not be.
 *
 * A failure is this hold's alone: its counters refused, or a write threw. It rolled back and stays
 * due, so the next tick tries again — but it must not stop the holds behind it in the batch.
 *
 * @param orderId - the order whose hold is stale
 * @returns whether this call released it
 */
const tryExpireOne = (orderId: string): Promise<boolean> =>
    expireOne(orderId).catch((error: unknown) => {
        // Stryker disable all
        logger.error({
            message: `Reservation sweep: could not expire the hold for order ${orderId} — it stays due`,
            error
        });
        // Stryker restore all
        return false;
    });

/**
 * Expire one batch of stale holds: each is released and announced.
 *
 * @param stale - holds past their window, as `findExpired` returned them
 * @returns how many this call actually released (a hold another path already released is skipped)
 */
const expireBatch = async (stale: readonly { orderId: unknown }[]): Promise<number> => {
    let expired = 0;

    for (const hold of stale) if (await tryExpireOne(String(hold.orderId))) expired += 1;

    return expired;
};

/**
 * The expiry tick: every hold whose window has closed gives its units back.
 *
 * Driven from outside — the app ships no scheduler, same as the carrier in `delivery`. Each hold
 * is released and announced: the release frees the units, the announcement lets `orders` cancel
 * the order behind it. `orders`' own cancel calls back into `releaseForOrder` and finds the hold
 * already released, so neither path can double-release.
 *
 * It DRAINS: batches of {@link SWEEP_BATCH_SIZE} until one comes back short, up to
 * {@link SWEEP_MAX_BATCHES}. One batch per five-minute tick was about 40 holds a minute, so an
 * attacker minting holds faster than that kept stock locked past its window. A released hold
 * leaves the `held` set, so a repeated read cannot see it twice.
 *
 * @param context - audit context for `ADMIN_RESERVATIONS_SWEPT`; the HTTP route always passes
 *   one, but `scripts/ops/sweep-reservations.ts`'s own scheduled run does not, so the recurring
 *   cron sweep writes no audit row — only an operator's on-demand call does
 * @returns how many holds were expired
 */
export const runReservationSweep = async (context?: CallerContext): Promise<number> => {
    let expired = 0;
    let seen = 0;
    let lastBatchWasFull = false;

    for (let batch = 0; batch < SWEEP_MAX_BATCHES; batch += 1) {
        const stale = await reservationRepository.findExpired(new Date(), SWEEP_BATCH_SIZE);
        seen += stale.length;
        expired += await expireBatch(stale);
        lastBatchWasFull = stale.length === SWEEP_BATCH_SIZE;
        if (!lastBatchWasFull) break;
    }

    // Still full after the last allowed batch: more is waiting. Said out loud, so a truncated run
    // is not read as done.
    if (lastBatchWasFull)
        // Stryker disable all
        logger.warn(
            `Reservation sweep: stopped after ${SWEEP_MAX_BATCHES} batches with holds still due — the next tick continues`
        );
    // Stryker restore all

    // Stryker disable next-line all
    logger.info(`Reservation sweep: ${expired} of ${seen} stale holds expired`);

    recordAudit(context, {
        action: inventoryAuditActions.ADMIN_RESERVATIONS_SWEPT,
        outcome: 'success',
        target_type: 'reservation',
        metadata: { expired }
    });

    return expired;
};
