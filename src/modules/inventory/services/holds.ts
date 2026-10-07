/**
 * @module
 * What happens to a hold after it is taken: commit, release, restock, extend, and the cache refresh.
 */

import type { ClientSession } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { StockMovementReason } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { withTransaction } from '@infrastructure/runtime/database';
import { SYSTEM_ACTOR, callerForSubject } from '@kernel/permissions';
import type { ReservationStatus } from '../model';
import { reservationRepository } from '../repository';
import { inventoryAuditActions } from '../audit';
import { applyToEveryLine } from './transition';
import { refreshStockCacheForProducts } from './returns';

/**
 * Claim a hold and move its counters as ONE unit: both land, or neither does.
 *
 * The claim makes the move at-most-once; the transaction makes it all-or-nothing. A write that
 * throws, or a line that refuses, undoes the claim too, so a retry starts over instead of finding
 * the hold closed with its counters never moved.
 *
 * @param orderId - the order whose hold is claimed
 * @param from - the status the hold must be in
 * @param to - the status it moves to
 * @param reason - which ledger movement every line records
 * @param session - the caller's transaction; without one, this opens its own and refreshes the
 *   catalogue's stock cache once it has committed (see {@link refreshStockCacheForOrder})
 * @returns whether this call was the one that claimed the hold
 * @throws {Error} when a line's counters refuse the movement; nothing is claimed
 */
const claimAndApply = (
    orderId: string,
    from: ReservationStatus,
    to: ReservationStatus,
    reason: StockMovementReason,
    session?: ClientSession
): Promise<boolean> => {
    const claimAndMove = (active: ClientSession): Promise<boolean> =>
        reservationRepository.claimStatus(orderId, from, to, active).then((hold) => {
            if (!hold) return false;
            return applyToEveryLine(reason, hold.items, { reference: orderId }, active).then(
                () => true
            );
        });

    if (session) return claimAndMove(session);

    return withTransaction(claimAndMove).then((claimed) =>
        claimed ? refreshStockCacheForOrder(orderId).then(() => true) : false
    );
};

/**
 * Turn an order's hold into a sale — the units leave.
 *
 * Claiming `held → committed` first is what makes it at-most-once.
 *
 * A missed claim is not automatically a no-op: a redelivered settlement finding the hold already
 * `committed` is a benign replay, but finding it `released`/`expired`, or finding no reservation at
 * all, means the order is paid and nothing is set aside for it. That case is alarmed — see
 * `docs/modules/inventory-reservations.md` — rather than swallowed like the replay is.
 *
 * @param orderId - the order that was paid for
 * @returns whether this call was the one that committed
 */
export const commitForOrder = async (orderId: string): Promise<boolean> => {
    if (await claimAndApply(orderId, 'held', 'committed', StockMovementReason.commit)) return true;

    // The claim missed. Read what the reservation actually is, to tell a benign replay
    // (already `committed`) from the two states meaning the order is paid with nothing held.
    const existing = await reservationRepository.findByOrderId(orderId);
    if (existing?.status === 'committed') return false;

    const reservationStatus = existing?.status ?? 'none';
    // Stryker disable all
    logger.error(
        `Inventory: commitForOrder found no hold for order ${orderId} (reservation: ${reservationStatus}) — the order is paid but no units were set aside for it`
    );
    // Stryker restore all
    recordAudit(
        // No CallerContext exists on this path — the caller is a payment settlement, which may
        // itself be running from a provider webhook with no human behind it. Same fallback
        // `orders/services/cancel.ts` uses for its own no-context case. No `actor_role`/
        // `actor_user_id` override needed either: `buildAuditEvent`'s defaults already read them
        // off `SYSTEM_ACTOR`'s own caller.
        { caller: callerForSubject(SYSTEM_ACTOR, 'Order'), analyticsConsent: false },
        {
            action: inventoryAuditActions.ADMIN_COMMIT_ORPHANED,
            outcome: 'failure',
            target_type: 'order',
            target_id: orderId,
            metadata: { reservationStatus }
        }
    );

    return false;
};

/**
 * Give an order's hold back — the units become sellable again.
 *
 * Same claim-then-act shape as the commit, so a cancel racing the sweep releases once. The two
 * reasons do identical arithmetic; the ledger records which story it was, because a customer who
 * changed their mind and one who never came back are different facts about the shop.
 *
 * @param orderId - the order giving up its units
 * @param reason - `release` for a cancellation, `expire` for a hold that timed out
 * @param session - the caller's transaction; see {@link refreshStockCacheForOrder}
 * @returns whether this call was the one that released
 */
export const releaseForOrder = async (
    orderId: string,
    // The two literals rather than the whole enum: only these end a hold without a sale, and
    // naming the pair stops a caller passing `commit` to a function that would record a sale.
    reason: 'release' | 'expire' = StockMovementReason.release,
    session?: ClientSession
): Promise<boolean> => claimAndApply(orderId, 'held', 'released', reason, session);

/**
 * Give a PAID order's committed units back to the shelf — the customer cancelled after payment,
 * so `commitForOrder` already took them out of `onHand`, not merely out of a hold.
 *
 * Same claim-then-act shape as {@link releaseForOrder}, but never merged into it: the sweep only
 * ever releases a stale HOLD, and folding restock in there would let it put a just-paid order's
 * units back on sale the moment its unrelated reservation record aged past the sweep's cutoff.
 * Only a cancel calls this, and only once `releaseForOrder` has already found nothing to release —
 * see `orders/services/cancel.ts`.
 *
 * @param orderId - the order whose committed units are coming back
 * @param session - the caller's transaction; see {@link refreshStockCacheForOrder}
 * @returns whether this call was the one that restocked
 */
export const restockForOrder = async (orderId: string, session?: ClientSession): Promise<boolean> =>
    claimAndApply(orderId, 'committed', 'restocked', StockMovementReason.restock, session);

/**
 * Bring the catalogue's stock cache into step for every line of an order's hold — the step a
 * caller that passed a `session` to {@link releaseForOrder} or {@link restockForOrder} owes once
 * its transaction has committed. The cache write leaves this module and cannot roll back, so it
 * waits for the commit instead of running inside it.
 *
 * @param orderId - the order whose hold just moved
 */
export const refreshStockCacheForOrder = (orderId: string): Promise<void> =>
    reservationRepository
        .findByOrderId(orderId)
        .then((hold) =>
            refreshStockCacheForProducts(
                (hold?.items ?? []).map(({ productId }) => String(productId))
            )
        );

/**
 * Extend a still-open hold to `hours` from now — a card payment gone `processing` (a SEPA debit,
 * some bank redirects) can take days to settle, and the standard hold window would let the
 * reservation sweep cancel an order whose money is still genuinely in flight. A hold already
 * claimed (committed/released/restocked) or missing matches nothing: there is no deadline left on
 * it to move, and this is silent about that — the caller has no decision to make either way.
 *
 * @param orderId - the order whose hold might still be open
 * @param hours - how many hours from now the hold should now expire
 */
export const extendHoldForOrder = (orderId: string, hours: number): Promise<void> =>
    reservationRepository
        .extendExpiry(orderId, new Date(Date.now() + hours * 60 * 60_000))
        .then(() => undefined);

/**
 * Was this order's hold given back without a sale — released by a cancel or an expiry?
 *
 * Such an order has nothing set aside for it, whatever its own status still says: an expiry
 * releases the hold first and cancels the order after. A missing hold is NOT this: only a closed
 * one names the oversell the payment gate guards against.
 *
 * @param orderId - the order being asked about
 * @returns whether its hold is in the `released` state
 */
export const isHoldReleased = (orderId: string): Promise<boolean> =>
    reservationRepository.findByOrderId(orderId).then((hold) => hold?.status === 'released');

/**
 * Are this order's units bound to the lines it currently holds?
 *
 * The hold freezes its own copy of the basket; `held`/`committed` means the counters answer to
 * that copy, so anything rewriting the order's lines must ask this first. A released, expired,
 * or missing hold binds nothing.
 *
 * @param orderId - the order being asked about
 * @returns whether stock is currently committed to this order's lines
 */
export const isStockBoundToOrder = (orderId: string): Promise<boolean> =>
    reservationRepository
        .findByOrderId(orderId)
        .then((hold) => hold?.status === 'held' || hold?.status === 'committed');
