/**
 * @module
 * The chokepoint: every counter move and its ledger row go through `applyTransition`.
 */

import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { productService } from '@modules/products';
import { StockMovementReason } from '@types';
import { counterDeltaFor } from '../domain';
import { stockLevelRepository, stockMovementRepository } from '../repository';

/**
 * Bring the catalogue's synced copy of one product's counters into step with the ledger's.
 *
 * Never fails the caller: the transition it follows already committed, and the next transition on
 * this product corrects the cache regardless.
 *
 * @param productId - the product whose cached counters are being refreshed
 */
export const syncStockCache = async (productId: string): Promise<void> => {
    const level = await stockLevelRepository.findByProductId(productId);
    if (level)
        await productService
            .syncStockCache(productId, { onHand: level.onHand, reserved: level.reserved })
            .catch((error: unknown) => {
                // Stryker disable all
                logger.error({
                    message: `Inventory: could not sync the catalogue's stock cache for product ${productId}`,
                    error
                });
                // Stryker restore all
            });
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
 * @param session - the caller's transaction. Given one, every read and write joins it, and the
 *   catalogue's stock cache is NOT synced here: that write leaves this module and cannot roll
 *   back, so the caller runs {@link refreshStockCacheForOrder} once its transaction commits
 * @returns whether the counters actually moved
 */
export const applyTransition = async (
    reason: StockMovementReason,
    productId: string,
    quantity: number,
    context: { reference?: string; note?: string } = {},
    session?: ClientSession
): Promise<boolean> => {
    // Only read the product back when this product has no level row yet — the common case (every
    // transition after the first) skips it entirely.
    if (!(await stockLevelRepository.findByProductId(productId, session))) {
        /*
         * `release`/`expire`/`commit` read "no row" as "nothing to move", not a failure: a
         * product's level row is deleted alongside it (see `module.ts`'s `PRODUCT_DELETED`
         * listener), so a hold still open against a since-deleted line has nowhere left to land.
         * Reporting `true` (moved, trivially) is what lets `releaseForOrder`/`commitForOrder`
         * keep going instead of logging an alarm for counters that no longer exist by design —
         * the sweep must still be able to expire the REST of an order's lines. `receive`/`adjust`
         * never reach this branch in practice: both check the product exists first.
         */
        if (reason !== StockMovementReason.receive && reason !== StockMovementReason.adjust) {
            return true;
        }

        await stockLevelRepository.ensure(productId, session);
    }
    const delta = counterDeltaFor(reason, quantity);
    const moved = await stockLevelRepository.applyDelta(
        productId,
        reason,
        quantity,
        delta,
        session
    );
    if (!moved) return false;

    await stockMovementRepository.create(
        {
            productId: new Types.ObjectId(productId),
            reason,
            ...delta,
            ...context
        },
        session
    );

    if (!session) await syncStockCache(productId);

    return true;
};
