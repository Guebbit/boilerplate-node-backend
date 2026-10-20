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
import { inventoryService, type StockLine } from '@modules/inventory';
import type { OrderDocument } from '../model';
import { orderRepository } from '../repository';
import { isPayable, type FulfillmentSummary } from '../domain';
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
 * Give some of an order's held units back, in the caller's transaction: a cancelled remainder
 * that was never shipped. The mirror of {@link shipStock} — `orders` is the only module that
 * drives an order's hold, so `returns` asks here instead of reaching `inventory` for it.
 *
 * @param orderId - the order whose remainder is cancelled
 * @param lines - the cancelled units; a `backorder` line gives back a preorder allowance
 * @param session - the cancel's transaction
 * @returns whether an open hold was there to take from
 */
export const releaseStock = (
    orderId: string,
    lines: readonly StockLine[],
    session: ClientSession
): Promise<boolean> => inventoryService.releaseLinesForOrder(orderId, lines, session);

/**
 * Give an order's still-open hold `hours` more from now: a payment that is in the provider's
 * hands for days (a bank debit) must not lose its units to the reservation sweep meanwhile. A
 * hold that is already claimed or missing has no deadline left to move, and this says nothing.
 *
 * @param orderId - the order whose hold might still be open
 * @param hours - how long from now the hold may last
 */
export const extendHold = (orderId: string, hours: number): Promise<void> =>
    inventoryService.extendHoldForOrder(orderId, hours);

/**
 * Whether money may still be taken for this order right now: it is awaiting payment AND its
 * units are still set aside. A hold already released (an expiry whose cancellation has not landed
 * yet) means the shelf may be gone; a MISSING hold is not that, only a closed one is.
 *
 * Asked before a card is charged, where the buyer can still be refused. Doors that record money
 * already taken do not ask it: refusing there would not un-pay anything.
 *
 * @param orderId - the order a payment would be charged into
 * @returns `false` when the order is gone, past payment, or its hold was given back
 */
export const isPayableNow = (orderId: string): Promise<boolean> =>
    orderRepository
        .findByIdScoped(orderId)
        .then((order) =>
            order && isPayable(order.status)
                ? inventoryService.isHoldReleased(orderId).then((released) => !released)
                : false
        );

/**
 * Bring the catalogue's stock cache into step after a transaction that moved these products'
 * counters has committed — the cache write cannot roll back, so it waits for the commit.
 *
 * @param productIds - the products whose counters just moved
 */
export const refreshShelf = (productIds: readonly string[]): Promise<void> =>
    inventoryService.refreshStockCacheForProducts(productIds);
