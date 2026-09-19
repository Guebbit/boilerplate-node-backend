/**
 * @module
 * Inventory — the only place stock changes. A counter never moves without a ledger row, and
 * never the reverse; both halves happen inside `applyTransition`, which every function here
 * goes through. No Mongo transactions, matching the rest of the repo — gaps are noted at the
 * call sites that own them. See: docs/modules/inventory.md
 */

import { Types } from 'mongoose';
import type { QueryFilter } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { emitDomainEvent } from '@kernel/events';
import { productService } from '@modules/products';
import { StockMovementReason, type InventoryLevel } from '@types';
import {
    normalizePagination,
    buildPaginatedMeta,
    type PaginatedMeta,
    type PaginationInput
} from '@infrastructure/persistence/search';
import { counterDeltaFor } from './domain';
import { reservationTtlMinutes, lowStockThreshold } from './config';
import { stockLevelRepository, stockMovementRepository, reservationRepository } from './repository';
import { RESERVATION_EXPIRED } from './events';
import type { StockLevelDocument, StockMovementDocument } from './model';
import type { CallerContext } from '@types';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { SYSTEM_ACTOR, callerForSubject } from '@kernel/permissions';
import { inventoryAuditActions } from './audit';

/** A line being held or given back. Ids as strings — the repository converts. */
export interface StockLine {
    productId: string;
    quantity: number;
}

/** One line a hold could not cover, and by how much it fell short. */
export interface StockShortfall {
    productId: string;
    title: string;
    requested: number;
    available: number;
}

/**
 * What a reserve answers — a result rather than a boolean, so a refusal can name which line and
 * how many are left, read back at the moment it refused rather than a stale pre-flight figure.
 */
export type ReserveOutcome = { held: true } | { held: false; shortfalls: StockShortfall[] };

/** What a stock-board read accepts. */
export interface LevelFilters extends PaginationInput {
    lowOnly?: boolean;
}

/** What a ledger read accepts, on top of the shared `page`/`pageSize`. */
export interface MovementFilters {
    productId?: string;
    reason?: StockMovementReason;
}

/** How many holds one sweep will expire before asking to be run again. */
const SWEEP_BATCH_SIZE = 200;

/**
 * Which condition guards a given transition — kept as a table so it stays in sync with
 * `counterDeltaFor`'s reason→deltas table, asserted by `tests/unit/transitions.test.ts`. `commit`
 * and `adjust` read `onHand`/`reserved` directly rather than `available`, matching the invariant
 * each protects: a sale must find both real, a correction must not cut below what's promised.
 *
 * @param reason - the transition
 * @param quantity - how many units; signed only for `adjust`
 * @returns the Mongo condition `applyDelta` must match for the transition to apply
 */
const conditionFor = (
    reason: StockMovementReason,
    quantity: number
): QueryFilter<StockLevelDocument> => {
    switch (reason) {
        case StockMovementReason.reserve: {
            return { available: { $gte: quantity } };
        }
        case StockMovementReason.commit: {
            return { onHand: { $gte: quantity }, reserved: { $gte: quantity } };
        }
        case StockMovementReason.release:
        case StockMovementReason.expire: {
            return { reserved: { $gte: quantity } };
        }
        case StockMovementReason.receive: {
            return {};
        }
        case StockMovementReason.adjust: {
            return { $expr: { $gte: [{ $add: ['$onHand', quantity] }, '$reserved'] } };
        }
    }
};

/**
 * Move one product's counters and record why, or do neither.
 *
 * The chokepoint every stock change in the application passes through. `ensure` guarantees a row
 * exists first — a product with no level yet reads as all-zero, the correct starting point for
 * every transition including the very first `receive` — then the conditional write decides the
 * rest: a refusal is not a movement, so no row is written. Last, this product's synced copy on
 * `products` is brought into step; see `docs/modules/inventory.md#why-products-still-carries-a-copy`
 * for why that sync is a plain call here and never a domain event.
 *
 * @param reason - the transition; decides the guard, the write and the deltas recorded
 * @param productId - the product whose counters move
 * @param quantity - how many units; signed only for `adjust`
 * @param context - what to record on the row beyond the deltas
 * @returns whether the counters actually moved
 */
const applyTransition = async (
    reason: StockMovementReason,
    productId: string,
    quantity: number,
    context: { reference?: string; note?: string } = {}
): Promise<boolean> => {
    // Only read the product back when this product has no level row yet — the common case (every
    // transition after the first) skips it entirely.
    if (!(await stockLevelRepository.findByProductId(productId))) {
        /*
         * `release`/`expire`/`commit` read "no row" as "nothing to move", not a failure: a
         * product's level row is deleted alongside it (see the `PRODUCT_DELETED` listener
         * below), so a hold still open against a since-deleted line has nowhere left to land.
         * Reporting `true` (moved, trivially) is what lets `releaseForOrder`/`commitForOrder`
         * keep going instead of logging an alarm for counters that no longer exist by design —
         * the sweep must still be able to expire the REST of an order's lines. `receive`/`adjust`
         * never reach this branch in practice any more: both check the product exists first.
         */
        if (reason !== StockMovementReason.receive && reason !== StockMovementReason.adjust) {
            return true;
        }

        await stockLevelRepository.ensure(productId);
    }
    const delta = counterDeltaFor(reason, quantity);
    const moved = await stockLevelRepository.applyDelta(
        productId,
        conditionFor(reason, quantity),
        delta
    );
    if (!moved) return false;

    await stockMovementRepository.create({
        productId: new Types.ObjectId(productId),
        reason,
        ...delta,
        ...context
    });

    const level = await stockLevelRepository.findByProductId(productId);
    if (level)
        await productService
            .syncStockCache(productId, { onHand: level.onHand, reserved: level.reserved })
            .catch((error: unknown) => {
                // Never fails the transition that already committed — see the docblock above.
                // The next transition on this product corrects the cache regardless.
                logger.error({
                    message: `Inventory: could not sync the catalogue's stock cache for product ${productId}`,
                    error
                });
            });

    return true;
};

/**
 * One product's counters, read back after a write.
 *
 * @param productId - the product
 * @returns its level, or `null` if the product has no level row (never received, or gone)
 */
const levelFor = async (productId: string): Promise<InventoryLevel | null> => {
    const [level, product] = await Promise.all([
        stockLevelRepository.findByProductId(productId),
        productService.findByIdRaw(productId)
    ]);
    if (!level || !product) return null;

    return {
        productId: String(level.productId),
        title: product.title,
        onHand: level.onHand,
        reserved: level.reserved,
        available: level.available
    };
};

/**
 * Hold every line for an order, or hold none of it.
 *
 * Exactly-once: the hold is written first, and its unique `orderId` means a retried checkout
 * loses the insert without touching a counter. Lines are then taken one conditional write each,
 * so two checkouts racing the last unit resolve inside mongod. A failed line rolls back through
 * `applyTransition` — same as every other change — so the ledger shows the take and give-back
 * rather than netting them to silence.
 *
 * @param orderId - the order the hold belongs to
 * @param lines - what it claims
 * @param holdMinutes - how long the hold survives; `reservationTtlMinutes()` unless the caller
 *   is checking out a method with its own window (`bank_transfer`'s is longer, in hours)
 * @returns `held`, or the lines that fell short with what is actually available
 */
export const reserveForOrder = async (
    orderId: string,
    lines: readonly StockLine[],
    holdMinutes: number = reservationTtlMinutes()
): Promise<ReserveOutcome> => {
    const expiresAt = new Date(Date.now() + holdMinutes * 60_000);
    const hold = await reservationRepository.insertHold(orderId, lines, expiresAt);
    // Already held — a retry, or a double-clicked button. The first call did the work.
    if (!hold) return { held: true };

    const taken: StockLine[] = [];
    for (const line of lines) {
        const held = await applyTransition(
            StockMovementReason.reserve,
            line.productId,
            line.quantity,
            { reference: orderId }
        );
        if (!held) {
            /*
             * Read the blocker back before unwinding, so the reported number is the one that
             * actually refused this line, not what a pre-flight saw earlier. Read from this
             * module's own level, the source of truth — never the product's synced copy, which
             * can lag by one transition. A deleted product or a level that never existed reads as
             * nothing available, which is true either way.
             */
            const [blockerLevel, blockerProduct] = await Promise.all([
                stockLevelRepository.findByProductId(line.productId),
                productService.findByIdRaw(line.productId)
            ]);
            const shortfall: StockShortfall = {
                productId: line.productId,
                title: blockerProduct?.title ?? '',
                requested: line.quantity,
                available: blockerLevel?.available ?? 0
            };

            for (const undo of taken)
                await applyTransition(StockMovementReason.release, undo.productId, undo.quantity, {
                    reference: orderId,
                    note: 'rolled back — another line could not be held'
                });
            await reservationRepository.deleteOne(hold);
            return { held: false, shortfalls: [shortfall] };
        }
        taken.push(line);
    }

    return { held: true };
};

/**
 * Turn an order's hold into a sale — the units leave.
 *
 * Claiming `held → committed` first is what makes it at-most-once. A line whose counters refuse is
 * logged rather than thrown: the money has already moved, so failing the request would misreport
 * the payment, and the refusal itself means the records need a human.
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
    const hold = await reservationRepository.claimStatus(orderId, 'held', 'committed');

    if (hold) {
        for (const { productId, quantity } of hold.items) {
            const committed = await applyTransition(
                StockMovementReason.commit,
                String(productId),
                quantity,
                { reference: orderId }
            );
            if (!committed)
                logger.error(
                    `Inventory: could not commit ${quantity} of product ${String(productId)} for order ${orderId} — the hold was claimed but the counters refused`
                );
        }

        return true;
    }

    // The claim missed. Read what the reservation actually is, to tell a benign replay
    // (already `committed`) from the two states meaning the order is paid with nothing held.
    const existing = await reservationRepository.findByOrderId(orderId);
    if (existing?.status === 'committed') return false;

    const reservationStatus = existing?.status ?? 'none';
    logger.error(
        `Inventory: commitForOrder found no hold for order ${orderId} (reservation: ${reservationStatus}) — the order is paid but no units were set aside for it`
    );
    emitAuditEvent(
        buildAuditEvent(
            // No CallerContext exists on this path — the caller is a payment settlement, which may
            // itself be running from a provider webhook with no human behind it. Same fallback
            // `orders/services/cancel.ts` uses for its own no-context case.
            { caller: callerForSubject(SYSTEM_ACTOR, 'Order'), analyticsConsent: false },
            {
                action: inventoryAuditActions.ADMIN_COMMIT_ORPHANED,
                outcome: 'failure',
                actor_role: 'admin',
                actor_user_id: 'system',
                target_type: 'order',
                target_id: orderId,
                metadata: { reservationStatus }
            }
        )
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
 * @returns whether this call was the one that released
 */
export const releaseForOrder = async (
    orderId: string,
    // The two literals rather than the whole enum: only these end a hold without a sale, and
    // naming the pair stops a caller passing `commit` to a function that would record a sale.
    reason: 'release' | 'expire' = StockMovementReason.release
): Promise<boolean> => {
    const hold = await reservationRepository.claimStatus(orderId, 'held', 'released');
    if (!hold) return false;

    for (const { productId, quantity } of hold.items) {
        const released = await applyTransition(reason, String(productId), quantity, {
            reference: orderId
        });
        if (!released)
            logger.error(
                `Inventory: could not release ${quantity} of product ${String(productId)} for order ${orderId} — the hold was claimed but the counters refused`
            );
    }

    return true;
};

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
const isStockBoundToOrder = (orderId: string): Promise<boolean> =>
    reservationRepository
        .findByOrderId(orderId)
        .then((hold) => hold?.status === 'held' || hold?.status === 'committed');

/**
 * The expiry tick: every hold whose window has closed gives its units back.
 *
 * Driven from outside — the app ships no scheduler, same as the carrier in `delivery`. Each hold
 * is released and announced: the release frees the units, the announcement lets `orders` cancel
 * the order behind it. `orders`' own cancel calls back into `releaseForOrder` and finds the hold
 * already released, so neither path can double-release.
 *
 * @param context - audit context for `ADMIN_RESERVATIONS_SWEPT`; tests omit it to skip the emit
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
        logger.warn(
            `Reservation sweep: hit the ${SWEEP_BATCH_SIZE}-hold batch cap — run it again to continue`
        );

    logger.info(`Reservation sweep: ${expired} of ${stale.length} stale holds expired`);

    if (context)
        emitAuditEvent(
            buildAuditEvent(context, {
                action: inventoryAuditActions.ADMIN_RESERVATIONS_SWEPT,
                outcome: 'success',
                target_type: 'reservation',
                metadata: { expired }
            })
        );

    return expired;
};

/**
 * Guarantee a product has a level row, even at zero — `module.ts`'s `PRODUCT_CREATED` listener's
 * own job, called REGARDLESS of the opening quantity. `receive` alone used to be this module's
 * only reaction to a new product, and `receive` is never called for an opening count of zero, so
 * a product created with none never got a row at all: invisible to the stock board and the
 * low-stock gauge, both of which start from this collection.
 *
 * @param productId - the product just created
 */
export const ensureLevel = (productId: string): Promise<void> =>
    stockLevelRepository.ensure(productId).then(() => undefined);

/**
 * Erase a product's level row — `module.ts`'s `PRODUCT_DELETED` listener's own job, and ONLY for
 * the `hardDelete: true` half of that event: a soft delete (or its restore) must leave the
 * counters untouched, since a restore has to come back to them. See
 * `repository.ts`'s `deleteByProductId` for why `stockmovements` is untouched either way.
 *
 * @param productId - the product just hard-deleted
 */
export const removeLevel = (productId: string): Promise<void> =>
    stockLevelRepository.deleteByProductId(productId);

/**
 * Units arrive from a supplier. The only guard is that the product exists, so a refusal means
 * it does not.
 *
 * @param productId - the product
 * @param quantity - how many arrived; strictly positive, the contract enforces it too
 * @param note - what to record: supplier, delivery note, operator's words
 * @param context - audit context for `ADMIN_STOCK_RECEIVED`; tests omit it to skip the emit
 * @returns the counters after the delivery, or 404 if the product is unknown
 */
export const receive = async (
    productId: string,
    quantity: number,
    note?: string,
    context?: CallerContext
): Promise<ResponseSuccess<InventoryLevel> | ResponseReject> => {
    // Checked BEFORE the write: `conditionFor`'s `receive` case is `{}` (any row matches, or a
    // fresh one is created), so an unknown product would otherwise still get a level row AND a
    // ledger entry before this ever found out there was nothing to receive against.
    const product = await productService.findByIdRaw(productId);
    if (!product) return generateReject(404, [t('inventory.product-not-found')]);

    const received = await applyTransition(
        StockMovementReason.receive,
        productId,
        quantity,
        note === undefined ? {} : { note }
    );
    if (!received) return generateReject(404, [t('inventory.product-not-found')]);

    const level = await levelFor(productId);
    if (!level) return generateReject(404, [t('inventory.product-not-found')]);

    if (context)
        emitAuditEvent(
            buildAuditEvent(context, {
                action: inventoryAuditActions.ADMIN_STOCK_RECEIVED,
                outcome: 'success',
                target_type: 'product',
                target_id: productId,
                metadata: { quantity, onHand: level.onHand }
            })
        );

    return generateSuccess(level, 200, t('inventory.receive-success'));
};

/**
 * A stocktake correction — signed, since shrinkage is the common case and negative. Refused if it
 * would leave fewer units than are already reserved: those are promised to orders that exist, and
 * the fix is to cancel orders rather than let availability go negative and oversell.
 *
 * @param productId - the product
 * @param delta - signed and non-zero; the controller rejects zero
 * @param note - why; an unexplained correction is what an audit looks for
 * @param context - audit context for `ADMIN_STOCK_ADJUSTED`; tests omit it to skip the emit
 * @returns the counters after the correction, 404 if unknown, or 409 if below reserved
 */
export const adjust = async (
    productId: string,
    delta: number,
    note?: string,
    context?: CallerContext
): Promise<ResponseSuccess<InventoryLevel> | ResponseReject> => {
    const product = await productService.findByIdRaw(productId);
    if (!product) return generateReject(404, [t('inventory.product-not-found')]);

    const adjusted = await applyTransition(
        StockMovementReason.adjust,
        productId,
        delta,
        note === undefined ? {} : { note }
    );
    if (!adjusted) {
        /*
         * The write's guard covers two things at once — the product existing and the correction
         * fitting above what is reserved — so `false` alone can't say which refused. Re-reading
         * separates them, so a product deleted between the check and this write reports 404
         * rather than a misleading stock conflict.
         */
        const stillThere = await productService.findByIdRaw(productId);
        if (!stillThere) return generateReject(404, [t('inventory.product-not-found')]);

        return generateReject(409, [
            {
                code: 'INVENTORY_BELOW_RESERVED',
                message: t('inventory.below-reserved')
            }
        ]);
    }

    const level = await levelFor(productId);
    if (!level) return generateReject(404, [t('inventory.product-not-found')]);

    if (context)
        emitAuditEvent(
            buildAuditEvent(context, {
                action: inventoryAuditActions.ADMIN_STOCK_ADJUSTED,
                outcome: 'success',
                target_type: 'product',
                target_id: productId,
                metadata: { delta, note, onHand: level.onHand }
            })
        );

    return generateSuccess(level, 200, t('inventory.adjust-success'));
};

/**
 * A page of the stock board — every product's counters, scarcest first, sorted by what's left
 * rather than name. Paged and sorted inside mongod on `stocklevels` alone; the title each row
 * needs is asked of `productService` AFTER the page is settled, API composition rather than a
 * database join across module boundaries — see `repository.ts`'s `stockBoard` and 1-D1's writeup.
 * A row whose product `findManyByIds` cannot find any more falls back to the id itself rather
 * than dropping the row: `3.10`'s cleanup keeps a hard-deleted product's level row from
 * outliving it, so this should be unreachable in practice, and a row a buggy future change left
 * behind is still worth an admin seeing, not silently hiding a counter that still holds units.
 *
 * @param filters - `lowOnly` to keep only scarce rows, plus the shared `page`/`pageSize`
 * @returns the page and its pagination meta
 */
export const listLevels = async (
    filters: LevelFilters = {}
): Promise<{ items: InventoryLevel[]; meta: PaginatedMeta }> => {
    const pagination = normalizePagination(filters);
    const { items, totalItems } = await stockLevelRepository.stockBoard({
        skip: pagination.skip,
        limit: pagination.pageSize,
        ...(filters.lowOnly ? { maxAvailable: lowStockThreshold() } : {})
    });

    const products = await productService.findManyByIds(items.map((item) => item.productId));
    const titleOf = new Map(products.map((product) => [String(product._id), product.title]));

    return {
        items: items.map((item) => ({
            ...item,
            title: titleOf.get(item.productId) ?? item.productId
        })),
        meta: buildPaginatedMeta(pagination, totalItems)
    };
};

/**
 * How many PUBLICLY VISIBLE products are at or under the low-stock threshold — the gauge
 * `metrics.ts` scrapes. Composed the same way `listLevels` is: the candidate ids come from this
 * module's own counters, `productService.countPublic` answers which of them a buyer could
 * actually find.
 */
export const lowStockCount = (): Promise<number> =>
    stockLevelRepository
        .lowAvailabilityProductIds(lowStockThreshold())
        .then((ids) => productService.countPublic(ids));

/**
 * A page of the ledger, newest first. Reports `totalItems` since this is the record an auditor
 * works through — a read that silently truncated it would misreport history as complete.
 *
 * @param filters - `productId`, `reason`, and the shared `page`/`pageSize`
 * @returns the page and its pagination meta
 */
export const listMovements = (
    filters: MovementFilters = {}
): Promise<{ items: StockMovementDocument[]; meta: PaginatedMeta }> =>
    // No sort argument: `search`'s default is `DEFAULT_SORT`, which is this exact order and
    // the only one that makes a paged ledger stable.
    stockMovementRepository.search(filters);

/** The module's one service handle. */
export const inventoryService = {
    reserveForOrder,
    commitForOrder,
    releaseForOrder,
    isStockBoundToOrder,
    runReservationSweep,
    ensureLevel,
    removeLevel,
    receive,
    adjust,
    listLevels,
    lowStockCount,
    listMovements
};
