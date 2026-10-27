/**
 * @module
 * Setting units aside AGAIN for an order whose parcel was lost. The units left the shelf when the
 * parcel shipped, so what can be set aside now is whatever the shelf has free; the rest is owed
 * and becomes a claim on the restock, outside the backorder cap (that cap limits new sales, not a
 * promise the shop already made). Never touches units held for another order.
 *
 * See: docs/modules/inventory-reservations.md#owed-after-a-loss
 */

import type { ClientSession } from 'mongoose';
import { StockMovementReason } from '@types';
import { reservationRepository, stockLevelRepository } from '../repository';
import type { HoldLine } from '../domain';
import type { StockLine, TopUp } from './types';
import { applyTransition } from './transition';

/** The ledger note of the shelf part and of the owed part. */
const NOTES = {
    shelf: 'set aside again — a parcel of this order was reported lost',
    owed: 'owed — a parcel of this order was reported lost and the shelf could not cover it'
} as const;

/**
 * Take one line: reserve the free shelf units, claim the rest uncapped. A product with no stock
 * level (deleted) claims nothing: the loss is recorded elsewhere and there is nothing to count.
 *
 * @param orderId - the order
 * @param line - the units the lost parcel carried
 * @param session - the act's transaction
 * @throws {Error} when a counter refuses a write the same snapshot said would land
 */
const takeOne = async (
    orderId: string,
    line: StockLine,
    session: ClientSession
): Promise<TopUp> => {
    const level = await stockLevelRepository.findByProductId(line.productId, session);
    if (!level) return { productId: line.productId, shelf: 0, owed: 0 };

    const shelf = Math.min(Math.max(level.available, 0), line.quantity);
    const owed = line.quantity - shelf;
    if (
        shelf > 0 &&
        !(await applyTransition(
            StockMovementReason.reserve,
            line.productId,
            shelf,
            { reference: orderId, note: NOTES.shelf },
            session
        ))
    )
        throw new Error(
            `Inventory: could not set ${shelf} of product ${line.productId} aside again for order ${orderId} — the counters refused`
        );
    if (
        owed > 0 &&
        !(await applyTransition(
            StockMovementReason.backorder,
            line.productId,
            owed,
            { reference: orderId, note: NOTES.owed, uncapped: true },
            session
        ))
    )
        throw new Error(
            `Inventory: could not claim ${owed} of product ${line.productId} for order ${orderId} — the counters refused`
        );
    return { productId: line.productId, shelf, owed };
};

/**
 * The hold lines a set of top-ups adds: shelf units as stock, owed units as a backorder claim.
 * @param taken - what each line came to
 */
const linesOf = (taken: readonly TopUp[]): HoldLine[] =>
    taken.flatMap(({ productId, shelf, owed }): HoldLine[] => [
        ...(shelf > 0 ? [{ productId, quantity: shelf }] : []),
        ...(owed > 0 ? [{ productId, quantity: owed, kind: 'backorder' as const }] : [])
    ]);

/**
 * Top up an order's hold for a lost parcel, in the caller's transaction: per line the free shelf
 * units are reserved and the rest claimed as owed, then the hold names both. A hold that already
 * ended is reopened `committed`, keeping the original payment's place in the preorder queue.
 *
 * @param orderId - the order whose parcel was lost
 * @param lines - what the lost shipment carried
 * @param session - the caller's transaction; the catalogue's stock cache is the caller's to
 *   refresh once it has committed
 * @returns per product, the shelf part and the owed part
 * @throws {Error} when a counter or the hold refuses a write the snapshot said would land
 */
export const reserveMoreForOrder = async (
    orderId: string,
    lines: readonly StockLine[],
    session: ClientSession
): Promise<TopUp[]> => {
    const taken: TopUp[] = [];
    // One product after another, in id order, so two losses never take their locks oppositely.
    for (const line of lines.toSorted((a, b) => a.productId.localeCompare(b.productId, 'en')))
        taken.push(await takeOne(orderId, line, session));

    const added = linesOf(taken);
    if (added.length > 0 && !(await reservationRepository.topUpItems(orderId, added, session)))
        throw new Error(
            `Inventory: the hold of order ${orderId} moved while it was being topped up`
        );
    return taken;
};
