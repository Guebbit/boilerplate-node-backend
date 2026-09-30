/**
 * @module
 * Putting returned goods back on the shelf, inside the caller's transaction.
 */

import type { ClientSession } from 'mongoose';
import { StockMovementReason } from '@types';
import { applyTransition, syncStockCache } from './transition';

/**
 * Put returned goods back on the shelf — units a customer sent back and staff received. Unlike
 * {@link restockForOrder} this claims no reservation: the order's hold was `committed` when it was
 * paid and stays that way, and it is the RETURN's own once-only move (`approved → received`) that
 * makes this at-most-once, so the caller runs both in one transaction. Each line becomes one
 * `restock` movement in the ledger, referencing the order and naming the return.
 *
 * A line the counters refuse throws, unlike the hold's own loop: here the caller's transaction is
 * the atomicity, and a return half-restocked is worse than one that did not happen.
 *
 * @param lines - what came back
 * @param context - `reference` names the order; `note` names the return
 * @param session - the caller's transaction; see {@link refreshStockCacheForProducts}
 * @throws {Error} when a line's counters refuse the restock
 */
export const restockReturnedLines = async (
    lines: readonly { productId: string; quantity: number }[],
    context: { reference: string; note: string },
    session?: ClientSession
): Promise<void> => {
    for (const { productId, quantity } of lines) {
        const applied = await applyTransition(
            StockMovementReason.restock,
            productId,
            quantity,
            context,
            session
        );
        if (!applied)
            throw new Error(
                `Inventory: could not restock ${quantity} of product ${productId} for ${context.note}`
            );
    }
};

/**
 * Bring the catalogue's stock cache into step for these products — what a caller of
 * {@link restockReturnedLines} inside a transaction owes once it has committed.
 *
 * @param productIds - the products whose counters just moved
 */
export const refreshStockCacheForProducts = async (
    productIds: readonly string[]
): Promise<void> => {
    for (const productId of new Set(productIds)) await syncStockCache(productId);
};
