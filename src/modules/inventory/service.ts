/**
 * @module
 * Inventory — the only place stock changes. A counter never moves without a ledger row, and
 * never the reverse; both halves happen inside `applyTransition`, which every function here
 * goes through. No Mongo transactions, matching the rest of the repo — gaps are noted at the
 * call sites that own them. See: docs/modules/inventory.md
 */

import { Types } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { emitDomainEvent } from '@kernel/events';
import { productRepository } from '@modules/products';
import { StockMovementReason, type InventoryLevel } from '@types';
import type { SearchFilters } from '@infrastructure/persistence/create-repository';
import {
    normalizePagination,
    buildPaginatedMeta,
    type PaginatedMeta,
    type PaginationInput
} from '@infrastructure/persistence/search';
import { counterDeltaFor, availabilityOf } from './domain';
import { reservationTtlMinutes, lowStockThreshold } from './config';
import { stockMovementRepository, reservationRepository } from './repository';
import { RESERVATION_EXPIRED } from './events';
import type { StockMovementDocument } from './model';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
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
export interface MovementFilters extends SearchFilters {
    productId?: string;
    reason?: StockMovementReason;
}

/** How many holds one sweep will expire before asking to be run again. */
const SWEEP_BATCH_SIZE = 200;

/**
 * Which repository call performs a given transition — kept as a table so it stays in sync with
 * `counterDeltaFor`'s reason→deltas table, asserted by `tests/unit/transitions.test.ts`.
 *
 * @param reason - the transition
 * @returns the conditional write that performs it, answering whether it matched
 */
const writerFor = (
    reason: StockMovementReason
): ((productId: string, quantity: number) => Promise<boolean>) => {
    switch (reason) {
        case StockMovementReason.reserve: {
            return productRepository.reserveUnits;
        }
        case StockMovementReason.commit: {
            return productRepository.commitUnits;
        }
        case StockMovementReason.release:
        case StockMovementReason.expire: {
            return productRepository.releaseUnits;
        }
        case StockMovementReason.receive: {
            return productRepository.receiveUnits;
        }
        case StockMovementReason.adjust: {
            return productRepository.adjustUnits;
        }
    }
};

/**
 * Move one product's counters and record why, or do neither.
 *
 * The chokepoint every stock change in the application passes through. The conditional write goes
 * first and its answer decides the rest: a refusal is not a movement, so no row is written.
 *
 * @param reason - the transition; decides both the write and the deltas recorded
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
    const moved = await writerFor(reason)(productId, quantity);
    if (!moved) return false;

    await stockMovementRepository.create({
        productId: new Types.ObjectId(productId),
        reason,
        ...counterDeltaFor(reason, quantity),
        ...context
    });

    return true;
};

/**
 * One product's counters, read back after a write.
 *
 * @param productId - the product
 * @returns its level, or `null` if the product has since gone
 */
const levelFor = async (productId: string): Promise<InventoryLevel | null> => {
    const product = await productRepository.findByIdRaw(productId);
    if (!product) return null;

    return {
        productId: String(product._id),
        title: product.title,
        onHand: product.onHand ?? 0,
        reserved: product.reserved ?? 0,
        available: availabilityOf(product)
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
 * @returns `held`, or the lines that fell short with what is actually available
 */
export const reserveForOrder = async (
    orderId: string,
    lines: readonly StockLine[]
): Promise<ReserveOutcome> => {
    const expiresAt = new Date(Date.now() + reservationTtlMinutes() * 60_000);
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
             * actually refused this line, not what a pre-flight saw earlier. A deleted product
             * reads as nothing available, which is true.
             */
            const blocker = await productRepository.findByIdRaw(line.productId);
            const shortfall: StockShortfall = {
                productId: line.productId,
                title: blocker?.title ?? '',
                requested: line.quantity,
                available: blocker ? availabilityOf(blocker) : 0
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
 * @param orderId - the order that was paid for
 * @returns whether this call was the one that committed
 */
export const commitForOrder = async (orderId: string): Promise<boolean> => {
    const hold = await reservationRepository.claimStatus(orderId, 'held', 'committed');
    if (!hold) return false;

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
 * Driven from outside — the app ships no scheduler, same as the courier in `delivery`. Each hold
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
    const product = await productRepository.findByIdRaw(productId);
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
        const stillThere = await productRepository.findByIdRaw(productId);
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
 * rather than name. Paged and sorted inside mongod via aggregation, since the sort key is derived.
 *
 * @param filters - `lowOnly` to keep only scarce rows, plus the shared `page`/`pageSize`
 * @returns the page and its pagination meta
 */
export const listLevels = async (
    filters: LevelFilters = {}
): Promise<ResponseSuccess<{ items: InventoryLevel[]; meta: PaginatedMeta }>> => {
    const pagination = normalizePagination(filters);
    const { items, totalItems } = await productRepository.availabilityPage({
        skip: pagination.skip,
        limit: pagination.pageSize,
        ...(filters.lowOnly ? { maxAvailable: lowStockThreshold() } : {})
    });

    return generateSuccess({ items, meta: buildPaginatedMeta(pagination, totalItems) });
};

/**
 * A page of the ledger, newest first. Reports `totalItems` since this is the record an auditor
 * works through — a read that silently truncated it would misreport history as complete.
 *
 * @param filters - `productId`, `reason`, and the shared `page`/`pageSize`
 * @returns the page and its pagination meta
 */
export const listMovements = (
    filters: MovementFilters = {}
): Promise<ResponseSuccess<{ items: StockMovementDocument[]; meta: PaginatedMeta }>> =>
    stockMovementRepository
        // No sort argument: `search`'s default is `DEFAULT_SORT`, which is this exact order and
        // the only one that makes a paged ledger stable.
        .search(filters)
        .then(({ items, meta }) => generateSuccess({ items, meta }));

/** The module's one service handle. */
export const inventoryService = {
    reserveForOrder,
    commitForOrder,
    releaseForOrder,
    isStockBoundToOrder,
    runReservationSweep,
    receive,
    adjust,
    listLevels,
    listMovements
};
