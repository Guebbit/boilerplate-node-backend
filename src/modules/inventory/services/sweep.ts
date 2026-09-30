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

/** How many holds one sweep will expire before asking to be run again. */
const SWEEP_BATCH_SIZE = 200;

/**
 * The expiry tick: every hold whose window has closed gives its units back.
 *
 * Driven from outside — the app ships no scheduler, same as the carrier in `delivery`. Each hold
 * is released and announced: the release frees the units, the announcement lets `orders` cancel
 * the order behind it. `orders`' own cancel calls back into `releaseForOrder` and finds the hold
 * already released, so neither path can double-release.
 *
 * @param context - audit context for `ADMIN_RESERVATIONS_SWEPT`; the HTTP route always passes
 *   one, but `scripts/ops/sweep-reservations.ts`'s own scheduled run does not, so the recurring
 *   cron sweep writes no audit row — only an operator's on-demand call does
 * @returns how many holds were expired
 */
export const runReservationSweep = async (context?: CallerContext): Promise<number> => {
    const stale = await reservationRepository.findExpired(new Date(), SWEEP_BATCH_SIZE);
    let expired = 0;

    for (const hold of stale) {
        const orderId = String(hold.orderId);
        const released = await releaseForOrder(orderId, StockMovementReason.expire);
        if (!released) continue;

        expired += 1;
        await emitDomainEvent(RESERVATION_EXPIRED, { orderId });
    }

    // A full batch means more is waiting. Said out loud, so a truncated run is not read as done.
    if (stale.length === SWEEP_BATCH_SIZE)
        // Stryker disable all
        logger.warn(
            `Reservation sweep: hit the ${SWEEP_BATCH_SIZE}-hold batch cap — run it again to continue`
        );
    // Stryker restore all

    // Stryker disable next-line all
    logger.info(`Reservation sweep: ${expired} of ${stale.length} stale holds expired`);

    recordAudit(context, {
        action: inventoryAuditActions.ADMIN_RESERVATIONS_SWEPT,
        outcome: 'success',
        target_type: 'reservation',
        metadata: { expired }
    });

    return expired;
};
