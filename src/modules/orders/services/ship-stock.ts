/**
 * @module
 * The status override that takes stock off the shelf: forward to `shipped` or `delivered` is a
 * dispatch, so whatever has not left yet leaves with it. Ordinary shipments take their own units
 * out, per shipment, through `./fulfillment`'s `shipStock`; this is the override's whole-remainder
 * twin. Shelf count drops when the goods leave, not when they are paid for (Shopify, Magento MSI,
 * Saleor, Medusa).
 *
 * See: docs/modules/inventory-reservations.md
 */

import type { ClientSession } from 'mongoose';
import { announceInTransaction, type OutboxAnnouncements } from '@kernel/outbox';
import type { DomainEventName } from '@kernel/events';
import { inventoryService } from '@modules/inventory';
import type { OrderDocument } from '../model';

/**
 * Write a status move, take whatever is left of the order's hold off the shelf, and announce the
 * move: one transaction, so an order never reads `shipped` while its units still count as on hand.
 *
 * The catalogue's stock cache lives outside the transaction and cannot roll back, so it is
 * refreshed once the commit has landed.
 *
 * @param orderId - the order that moves
 * @param write - the conditional status write; `null` when it matched nothing (a lost race)
 * @param announce - builds the event(s) from the order the write returned
 * @returns the order as it now stands, or `null` when the write matched nothing and no stock moved
 */
export const announceMoveShippingStock = (
    orderId: string,
    write: (session: ClientSession) => Promise<OrderDocument | null>,
    announce: (order: OrderDocument) => OutboxAnnouncements<DomainEventName>
): Promise<OrderDocument | null> =>
    announceInTransaction(
        (session) =>
            write(session).then((order) =>
                order ? inventoryService.shipForOrder(orderId, session).then(() => order) : order
            ),
        announce
    ).then((order) =>
        order ? inventoryService.refreshStockCacheForOrder(orderId).then(() => order) : order
    );
