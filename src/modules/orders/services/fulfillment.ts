/**
 * @module
 * The doors `delivery` writes through, inside its own transaction, when a fulfilment act changes
 * where an order's goods stand. `orders` is the only writer of its own fields, so `delivery`
 * reports — the summary, a forced step's history row, the units leaving the shelf — and this file
 * decides whether each still applies. Every door takes the act's session: the shipment, the
 * summary, the status move and the events commit together or not at all.
 *
 * See `docs/modules/orders.md#the-fulfilment-summary`.
 */

import type { ClientSession } from 'mongoose';
import { inventoryService } from '@modules/inventory';
import type { OrderDocument } from '../model';
import { orderRepository } from '../repository';
import type { FulfillmentSummary } from '../domain';
import { appendTimeline } from './timeline';

/**
 * Report where the goods stand, replacing the last report. The write is conditional on the order
 * still being fulfillable (`paid`, `processing` or `shipped`), which is what makes a shipment and
 * a cancel racing each other resolve to exactly one winner.
 *
 * @param orderId - the order
 * @param summary - recomputed from the fulfillment orders inside the same transaction
 * @param session - the act's transaction
 * @returns the order as it now stands, or `null` when it can no longer be fulfilled
 */
export const recordFulfillmentProgress = (
    orderId: string,
    summary: FulfillmentSummary,
    session: ClientSession
): Promise<OrderDocument | null> => orderRepository.writeFulfillment(orderId, summary, session);

/**
 * One order read inside an act's transaction — the snapshot the act's own writes land in, so a
 * refusal decided from it cannot be stale by the time the writes commit.
 *
 * @param orderId - the order
 * @param session - the act's transaction
 * @returns the order, or `null` when it does not exist
 */
export const readOrder = (orderId: string, session: ClientSession): Promise<OrderDocument | null> =>
    orderRepository.findInSession(orderId, session);

/** What a forced fulfilment act reports about itself. */
export interface ForcedFulfilment {
    /** Why the normal door did not apply — recorded as the timeline row's text. */
    reason: string;
    /** The override holder who forced it. */
    actorUserId: string;
    /** When it happened. */
    at: Date;
    /** The order's status before the act began. */
    from: OrderDocument['status'];
}

/**
 * Leave a timeline row for a forced fulfilment act — a shipment from `paid`, a delivery without a
 * carrier confirmation. The act does not always move the order, but staff skipped a step and the
 * row says so, the same `status_overridden` a status override writes. `to` is whatever the order's
 * status is once the act's own moves have landed, read in the act's snapshot.
 *
 * @param orderId - the order
 * @param forced - who forced it, why, and when
 * @param session - the act's transaction
 * @returns the order as it now stands, or `null` when it does not exist
 */
export const recordForcedFulfilment = (
    orderId: string,
    forced: ForcedFulfilment,
    session: ClientSession
): Promise<OrderDocument | null> =>
    orderRepository.findInSession(orderId, session).then((order) =>
        order
            ? appendTimeline(
                  orderId,
                  {
                      type: 'status_overridden',
                      actor: forced.actorUserId,
                      text: forced.reason,
                      data: { mode: 'forced', from: forced.from, to: order.status },
                      at: forced.at
                  },
                  session
              ).then(() => order)
            : null
    );

/**
 * Take what one shipment carries off the shelf, in the shipment's transaction. Shelf count drops
 * when goods LEAVE, per shipment, so a later return restocks units that really were taken out.
 *
 * @param orderId - the order shipping
 * @param lines - what the shipment carries
 * @param session - the shipment's transaction
 */
export const shipStock = (
    orderId: string,
    lines: readonly { productId: string; quantity: number }[],
    session: ClientSession
): Promise<boolean> => inventoryService.shipLinesForOrder(orderId, lines, session);

/**
 * Bring the catalogue's stock cache into step after a transaction that moved these products'
 * counters has committed — the cache write cannot roll back, so it waits for the commit.
 *
 * @param productIds - the products whose counters just moved
 */
export const refreshShelf = (productIds: readonly string[]): Promise<void> =>
    inventoryService.refreshStockCacheForProducts(productIds);
