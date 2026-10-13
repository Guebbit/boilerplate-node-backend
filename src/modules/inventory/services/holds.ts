/**
 * @module
 * What happens to a hold after it is taken: commit, ship, release, extend, and the cache refresh.
 */

import type { ClientSession } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { StockMovementReason } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { withTransaction } from '@infrastructure/runtime/database';
import { nudgeOutbox } from '@kernel/outbox';
import { SYSTEM_ACTOR, callerForSubject } from '@kernel/permissions';
import type { ReservationStatus } from '../model';
import { reservationRepository } from '../repository';
import { inventoryAuditActions } from '../audit';
import { takeFromHold } from '../domain';
import type { StockLine } from './types';
import { applyToEveryLine } from './transition';
import { refreshStockCacheForProducts } from './returns';
import { allocateWithin } from './allocate';

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
 * Alarm: an order is paid or shipping and its hold is missing or already given up.
 *
 * Audited as the system, not skipped: no CallerContext exists on these paths — the caller is a
 * payment settlement (possibly a provider webhook) or a status move, with no human behind it.
 *
 * @param orderId - the order with nothing set aside
 * @param reservationStatus - what the reservation actually is, `none` when it never existed
 * @param stage - the step that found it: `commit` (payment) or `ship` (dispatch)
 */
const raiseOrphanAlarm = (
    orderId: string,
    reservationStatus: string,
    stage: 'commit' | 'ship'
): void => {
    // Stryker disable all
    logger.error(
        `Inventory: ${stage}ForOrder found no hold for order ${orderId} (reservation: ${reservationStatus}) — the order is past payment but no units were set aside for it`
    );
    // Stryker restore all
    recordAudit(
        { caller: callerForSubject(SYSTEM_ACTOR, 'Order'), analyticsConsent: false },
        {
            action: inventoryAuditActions.ADMIN_COMMIT_ORPHANED,
            outcome: 'failure',
            targetType: 'order',
            targetId: orderId,
            metadata: { reservationStatus, stage }
        }
    );
};

/**
 * The body of {@link commitForOrder}, in the caller's transaction: claim the hold, then serve any
 * preorder lines the claim just made eligible.
 *
 * @param orderId - the order that was paid for
 * @param session - the payment's transaction
 * @returns whether the claim landed, and how many preorder allocations it triggered
 */
const commitWithin = async (
    orderId: string,
    session: ClientSession
): Promise<{ committed: boolean; allocated: number }> => {
    const hold = await reservationRepository.claimStatus(orderId, 'held', 'committed', session);
    if (hold) {
        // Paid preorder units wait for stock; stock that already arrived serves them now.
        const preorderProducts = hold.items
            .filter((item) => item.kind === 'preorder')
            .map((item) => String(item.productId));
        const allocations =
            preorderProducts.length > 0 ? await allocateWithin(preorderProducts, session) : [];
        return { committed: true, allocated: allocations.length };
    }

    // The claim missed. Read what the reservation actually is, to tell a benign replay from the
    // states meaning the order is paid with nothing held.
    const existing = await reservationRepository.findByOrderId(orderId);
    if (existing?.status === 'committed' || existing?.status === 'shipped')
        return { committed: false, allocated: 0 };

    raiseOrphanAlarm(orderId, existing?.status ?? 'none', 'commit');
    return { committed: false, allocated: 0 };
};

/**
 * Settle an order's hold at payment: `held → committed`. No counter moves — the units stay on
 * the shelf, still spoken for, until {@link shipForOrder}. No ledger row: the ledger has one row
 * per counter change, and the payment's date is the hold's `committedAt`, also the preorder
 * queue key.
 *
 * The claim is one conditional write, which is what makes it at-most-once.
 *
 * A missed claim is not automatically a no-op: a redelivered settlement finding the hold already
 * `committed` (or, if the parcel got ahead of a crashed settlement, `shipped`) is a benign
 * replay, but finding it `released`/`expired`, or finding no reservation at all, means the order
 * is paid and nothing is set aside for it. That case is alarmed — see
 * `docs/modules/inventory-reservations.md` — rather than swallowed like the replay is.
 *
 * @param orderId - the order that was paid for
 * @param session - the payment's transaction. The commit then lands with the order's `paid` move
 *   and the caller owes {@link refreshStockCacheForOrder} and a `nudgeOutbox` once it has
 *   committed; absent, this opens its own and does both
 * @returns whether this call was the one that committed
 */
export const commitForOrder = (orderId: string, session?: ClientSession): Promise<boolean> => {
    if (session) return commitWithin(orderId, session).then(({ committed }) => committed);

    return withTransaction((active) => commitWithin(orderId, active)).then(
        ({ committed, allocated }) => {
            if (allocated === 0) return committed;
            nudgeOutbox();
            return refreshStockCacheForOrder(orderId).then(() => committed);
        }
    );
};

/**
 * Take a dispatched order's units off the shelf: `committed → shipped`, `onHand` and `reserved`
 * both down, so `available` does not change.
 *
 * Runs inside the status move's transaction (`orders`), so the status and the shelf count land
 * together. A hold still `held` — the payment's own commit crashed and the retry sweep has not
 * run — ships too: the goods left either way. No hold, or one already given up, raises the same
 * alarm as a payment with nothing set aside; a hold already `shipped` is a replay and is silent.
 *
 * @param orderId - the order whose parcel left (or whose digital goods were fulfilled)
 * @param session - the status move's transaction; see {@link refreshStockCacheForOrder}
 * @returns whether this call was the one that shipped
 */
export const shipForOrder = async (orderId: string, session?: ClientSession): Promise<boolean> => {
    const claimed =
        (await claimAndApply(orderId, 'committed', 'shipped', StockMovementReason.ship, session)) ||
        (await claimAndApply(orderId, 'held', 'shipped', StockMovementReason.ship, session));
    if (claimed) return true;

    const existing = await reservationRepository.findByOrderId(orderId);
    if (existing?.status !== 'shipped')
        raiseOrphanAlarm(orderId, existing?.status ?? 'none', 'ship');
    return false;
};

/**
 * Take some lines out of an open hold and move their counters, in the caller's transaction: the
 * shared body of a partial shipment and a remainder cancel. The hold ends — `endsAs` — once its
 * last unit is out.
 *
 * @param orderId - the order
 * @param lines - what leaves the hold
 * @param reason - which ledger movement each line records (`ship` or `release`)
 * @param endsAs - the terminal status the hold takes when it empties
 * @param session - the caller's transaction
 * @returns whether an open hold was there to take from
 */
const takeLines = (
    orderId: string,
    lines: readonly StockLine[],
    reason: StockMovementReason,
    endsAs: ReservationStatus,
    session: ClientSession
): Promise<boolean> =>
    reservationRepository.findOpenByOrderId(orderId, session).then((hold) => {
        if (!hold) return false;

        const { remaining, taken } = takeFromHold(
            hold.items.map(({ productId, quantity, kind }) => ({
                productId: String(productId),
                quantity,
                ...(kind === 'preorder' ? { kind } : {})
            })),
            lines
        );
        return reservationRepository
            .replaceItems(orderId, remaining, remaining.length === 0 ? endsAs : undefined, session)
            .then((replaced) => {
                if (!replaced) return false;
                return applyToEveryLine(reason, taken, { reference: orderId }, session).then(
                    () => true
                );
            });
    });

/**
 * Take SOME of an order's units off the shelf — what one shipment carries. `onHand` and
 * `reserved` both drop by the shipped quantity, so `available` does not change; the hold keeps
 * what has not left yet and ends `shipped` once it is empty. Runs in the shipment's transaction,
 * so the shelf count and the shipment land together.
 *
 * A missing or given-up hold raises the same alarm a payment with nothing set aside does; a hold
 * already `shipped` is a replay and is silent.
 *
 * @param orderId - the order whose units are leaving
 * @param lines - what the shipment carries
 * @param session - the shipment's transaction; see {@link refreshStockCacheForOrder}
 * @returns whether an open hold was there
 */
export const shipLinesForOrder = async (
    orderId: string,
    lines: readonly StockLine[],
    session: ClientSession
): Promise<boolean> => {
    if (await takeLines(orderId, lines, StockMovementReason.ship, 'shipped', session)) return true;

    const existing = await reservationRepository.findByOrderId(orderId);
    if (existing?.status !== 'shipped')
        raiseOrphanAlarm(orderId, existing?.status ?? 'none', 'ship');
    return false;
};

/**
 * Give SOME of an order's units back — the unshipped remainder of one fulfillment order,
 * cancelled. `reserved` drops by the cancelled quantity, the units stay on the shelf and become
 * sellable; the hold keeps the rest and ends `released` once it is empty.
 *
 * @param orderId - the order whose units are given back
 * @param lines - the cancelled remainder
 * @param session - the cancel's transaction; see {@link refreshStockCacheForOrder}
 * @returns whether an open hold was there to take from
 */
export const releaseLinesForOrder = (
    orderId: string,
    lines: readonly StockLine[],
    session: ClientSession
): Promise<boolean> => takeLines(orderId, lines, StockMovementReason.release, 'released', session);

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
 * Give a PAID, not yet shipped order's claim back — the customer cancelled after payment, so the
 * hold is `committed` and `releaseForOrder` never matches it. The same arithmetic as a release
 * (`reserved` down, the units still on the shelf become sellable); no stock left the building.
 *
 * Same claim-then-act shape as {@link releaseForOrder}, but never merged into it: the sweep only
 * ever releases a stale HOLD, and folding this in there would let it put a just-paid order's
 * units back on sale the moment its unrelated reservation record aged past the sweep's cutoff.
 * Only a cancel calls this, and only once `releaseForOrder` has already found nothing to release —
 * see `orders/services/cancel.ts`.
 *
 * @param orderId - the order whose paid claim is being given up
 * @param session - the caller's transaction; see {@link refreshStockCacheForOrder}
 * @returns whether this call was the one that released
 */
export const releaseCommittedForOrder = async (
    orderId: string,
    session?: ClientSession
): Promise<boolean> =>
    claimAndApply(orderId, 'committed', 'released', StockMovementReason.release, session);

/**
 * Bring the catalogue's stock cache into step for every line of an order's hold — the step a
 * caller that passed a `session` to {@link releaseForOrder}, {@link releaseCommittedForOrder} or {@link shipForOrder} owes once
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
 * claimed (committed/shipped/released) or missing matches nothing: there is no deadline left on
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
