/**
 * @module
 * Handing arrived stock to the paid preorders waiting for it, oldest payment first.
 *
 * Runs in the receipt's own transaction, so the units never look sellable to a stranger between
 * arriving and being allocated. A paid preorder's claim (`preordered`) becomes a real hold
 * (`reserved`) on a real unit: `available` drops by what was allocated, the shelf count does not
 * move, and the order's hold now carries those units as ordinary `stock` — they ship, restock and
 * release like any other.
 *
 * See: docs/modules/inventory-reservations.md#preorders
 */

import type { ClientSession } from 'mongoose';
import { enqueueOutboxEvent, nudgeOutbox } from '@kernel/outbox';
import { withTransaction } from '@infrastructure/runtime/database';
import { StockMovementReason } from '@types';
import { reservationRepository, stockLevelRepository } from '../repository';
import type { ReservationDocument } from '../model';
import { PREORDER_ALLOCATED } from '../events';
import type { StockLine } from './types';
import { applyTransition } from './transition';
import { refreshStockCacheForProducts } from './returns';

/** One order's share of an allocation, and what it still waits for. */
interface Allocation {
    orderId: string;
    productId: string;
    quantity: number;
    waiting: number;
}

/**
 * A hold's items with `quantity` of one product moved from preorder claim to shelf units. The two
 * kinds of the same product stay separate lines, so a later ship or release can name which.
 *
 * @param hold - the paid hold
 * @param productId - the product whose units were allocated
 * @param quantity - how many units moved
 */
const withAllocated = (
    hold: ReservationDocument,
    productId: string,
    quantity: number
): StockLine[] => {
    const next: StockLine[] = [];
    let stock = quantity;
    for (const item of hold.items) {
        const id = String(item.productId);
        if (id !== productId) {
            next.push({ productId: id, quantity: item.quantity, kind: item.kind ?? 'stock' });
        } else if (item.kind === 'preorder') {
            if (item.quantity > quantity)
                next.push({ productId: id, quantity: item.quantity - quantity, kind: 'preorder' });
        } else {
            stock += item.quantity;
        }
    }
    next.push({ productId, quantity: stock, kind: 'stock' });
    return next;
};

/**
 * Allocate one product's free units down its queue of paid preorders.
 *
 * @param productId - the product whose units may now cover preorders
 * @param session - the caller's transaction
 * @returns what each order got, in queue order; empty when nothing was waiting or nothing was free
 */
const allocateProduct = async (
    productId: string,
    session: ClientSession
): Promise<Allocation[]> => {
    const level = await stockLevelRepository.findByProductId(productId, session);
    if (!level || level.preordered <= 0 || level.available <= 0) return [];

    const done: Allocation[] = [];
    let free = level.available;
    for (const hold of await reservationRepository.findPaidPreorderHolds(productId, session)) {
        if (free <= 0) break;
        const orderId = String(hold.orderId);
        const waiting = hold.items
            .filter((item) => String(item.productId) === productId && item.kind === 'preorder')
            .reduce((sum, item) => sum + item.quantity, 0);
        const quantity = Math.min(waiting, free);
        if (quantity <= 0) continue;

        const moved = await applyTransition(
            StockMovementReason.allocate,
            productId,
            quantity,
            { reference: orderId },
            session
        );
        if (!moved)
            throw new Error(
                `Inventory: could not allocate ${quantity} of product ${productId} to order ${orderId} — the counters refused`
            );
        await reservationRepository.replaceItems(
            orderId,
            withAllocated(hold, productId, quantity),
            undefined,
            session
        );
        free -= quantity;
        done.push({ orderId, productId, quantity, waiting: waiting - quantity });
    }
    return done;
};

/**
 * Allocate the given products, in the caller's transaction, and write one `preorder_allocated`
 * event per order and product served.
 *
 * @param productIds - the products to serve
 * @param session - the caller's transaction
 * @returns whatever was allocated
 */
export const allocateWithin = async (
    productIds: readonly string[],
    session: ClientSession
): Promise<Allocation[]> => {
    const all: Allocation[] = [];
    // One product after another: a transaction's session does not take parallel operations.
    for (const productId of new Set(productIds))
        all.push(...(await allocateProduct(productId, session)));

    for (const { orderId, productId, waiting } of all)
        await enqueueOutboxEvent(
            PREORDER_ALLOCATED,
            { orderId, productId, waiting },
            orderId,
            session
        );
    return all;
};

/**
 * Allocate in a transaction of its own, then do what only a committed write allows: wake the
 * outbox relay and bring the catalogue's stock cache into step.
 *
 * @param productIds - the products to serve
 */
const allocateProducts = (productIds: readonly string[]): Promise<void> =>
    withTransaction((session) => allocateWithin(productIds, session)).then((all) => {
        if (all.length === 0) return undefined;
        nudgeOutbox();
        return refreshStockCacheForProducts(all.map(({ productId }) => productId));
    });

/**
 * Serve whatever preorders an order's payment just made eligible: stock that arrived while the
 * order was still unpaid was skipped by the receipt, so the payment is the other moment to look.
 * Oldest payment first still holds — free units exist only when every earlier payer is served.
 *
 * @param orderId - the order whose hold was just committed
 */
export const allocateForOrder = (orderId: string): Promise<void> =>
    reservationRepository.findByOrderId(orderId).then((hold) => {
        const productIds = (hold?.items ?? [])
            .filter((item) => item.kind === 'preorder')
            .map((item) => String(item.productId));
        return productIds.length > 0 ? allocateProducts(productIds) : undefined;
    });
