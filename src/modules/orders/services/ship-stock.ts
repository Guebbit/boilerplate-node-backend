/**
 * @module
 * The status moves that take stock off the shelf: a parcel handed over, a digital order
 * fulfilled, an admin override past either. Shelf count drops when the goods leave, not when they
 * are paid for (Shopify, Magento MSI, Saleor, Medusa).
 *
 * See: docs/modules/inventory-reservations.md
 */

import type { ClientSession } from 'mongoose';
import { announceInTransaction } from '@kernel/outbox';
import type { OrderStatus } from '@types';
import { inventoryService } from '@modules/inventory';
import type { OrderDocument } from '../model';
import { statusChangedEvent } from './announce';

/**
 * Write a status move, take the order's units off the shelf, and announce the move: one
 * transaction, so an order never reads `shipped` while its units still count as on hand.
 *
 * The catalogue's stock cache lives outside the transaction and cannot roll back, so it is
 * refreshed once the commit has landed.
 *
 * @param orderId - the order that moves
 * @param from - the status it moves from, as announced
 * @param to - the status it moves to, as announced
 * @param write - the conditional status write; `null` when it matched nothing (a lost race)
 * @returns the order as it now stands, or `null` when the write matched nothing and no stock moved
 */
export const announceMoveShippingStock = (
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
    write: (session: ClientSession) => Promise<OrderDocument | null>
): Promise<OrderDocument | null> =>
    announceInTransaction(
        (session) =>
            write(session).then((order) =>
                order ? inventoryService.shipForOrder(orderId, session).then(() => order) : order
            ),
        () => statusChangedEvent(orderId, from, to)
    ).then((order) =>
        order ? inventoryService.refreshStockCacheForOrder(orderId).then(() => order) : order
    );
