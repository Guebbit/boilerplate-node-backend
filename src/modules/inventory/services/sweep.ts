/**
 * @module
 * The expiry tick: every hold whose window has closed gives its units back.
 */

import { logger } from '@infrastructure/adapters/logger';
import { emitDomainEvent } from '@kernel/events';
import { StockMovementReason } from '@types';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { reservationRepository } from '../repository';
import { RESERVATION_EXPIRED } from '../events';
import { inventoryAuditActions } from '../audit';
import { releaseForOrder } from './holds';

/** How many holds one batch of a sweep reads and expires. */
const SWEEP_BATCH_SIZE = 200;

/**
 * Batches one sweep will drain before it stops, whatever is left: 50 x 200 = 10,000 holds. A bound
 * so a pathological backlog ends a run (the next tick continues) instead of outliving the job's
 * lease; a real backlog is a few hundred.
 */
const SWEEP_MAX_BATCHES = 50;

/**
 * Expire one batch of stale holds: each is released and announced.
 *
 * @param stale - holds past their window, as `findExpired` returned them
 * @returns how many this call actually released (a hold another path already released is skipped)
 */
const expireBatch = async (stale: readonly { orderId: unknown }[]): Promise<number> => {
    let expired = 0;

    for (const hold of stale) {
        const orderId = String(hold.orderId);
        const released = await releaseForOrder(orderId, StockMovementReason.expire);
        if (!released) continue;

        expired += 1;
        await emitDomainEvent(RESERVATION_EXPIRED, { orderId });
    }

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
