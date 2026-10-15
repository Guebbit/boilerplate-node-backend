/**
 * @module
 * Reading an order's fulfilment — what the order page asks (`GET /delivery/order/:orderId`), the
 * narrow reads `returns` makes (what has shipped, what a remainder cancel would take) and the
 * account export's two sections. A fulfillment order and a shipment have no owner of their own:
 * ownership is the order's, read through the same scope every order read uses.
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { orderService } from '@modules/orders';
import { FulfillmentOrderStatus } from '@types';
import type { AuthContext, OrderFulfillment } from '@types';
import { hasWaitExpired, remainderLines, remainingOfLine } from '../domain';
import type { ProductQuantity } from '../domain';
import { fulfillmentOrderRepository, shipmentRepository } from '../repository';
import type { FulfillmentOrderDocument, ShipmentDocument } from '../model';
import { standingOn, fulfillmentOrderActions, shipmentActions } from './actions';
import { ensureFulfillmentOrders } from './ensure';
import { presentFulfillmentOrder, presentShipment } from '../presenter';

/**
 * The fulfilment of one of the caller's orders: both lists, each record with its own `actions`.
 * Makes the order's fulfillment orders first when a paid order has none — the safety net behind the
 * `paid` listener. An order that is not paid yet answers both lists empty: absence is the answer.
 *
 * @param orderId - the order
 * @param authContext - the caller; sees only their own, staff see anyone's
 */
export const getForOrder = (
    orderId: string,
    authContext?: AuthContext
): Promise<ResponseSuccess<OrderFulfillment> | ResponseReject> =>
    orderService.getById(orderId, orderService.callerScope(authContext)).then((order) => {
        if (!order) return generateReject(404, [t('delivery.order-not-found')]);

        const standing = standingOn(order, authContext);

        return ensureFulfillmentOrders(orderId)
            .then(() =>
                Promise.all([
                    fulfillmentOrderRepository.findByOrderId(orderId),
                    shipmentRepository.findByOrderId(orderId),
                    orderService.getById(orderId)
                ])
            )
            .then(([fulfillmentOrders, shipments, fresh]) => {
                // The order as `ensure` left it: its status may have moved while it ran.
                const current = fresh ?? order;
                return generateSuccess({
                    fulfillmentOrders: fulfillmentOrders.map((fulfillmentOrder) =>
                        presentFulfillmentOrder(
                            fulfillmentOrder,
                            fulfillmentOrderActions(fulfillmentOrder, current, standing),
                            standing.staff
                        )
                    ),
                    shipments: shipments.map((shipment) =>
                        presentShipment(shipment, shipmentActions(shipment, current, standing))
                    )
                });
            });
    });

/**
 * What has shipped from an order, per product — the sum over its fulfillment orders. `returns`
 * gates a return on this: only goods that left can come back.
 *
 * @param orderId - the order
 */
export const shippedQuantities = (orderId: string): Promise<ProductQuantity[]> =>
    fulfillmentOrderRepository.findByOrderId(orderId).then((all) => {
        const shipped = new Map<string, number>();
        for (const { lines } of all)
            for (const { productId, shippedQuantity } of lines)
                shipped.set(productId, (shipped.get(productId) ?? 0) + shippedQuantity);
        return [...shipped]
            .filter(([, quantity]) => quantity > 0)
            .map(([productId, quantity]) => ({ productId, quantity }));
    });

/** A fulfillment order's remainder, as `returns` lists what a cancel would take. */
export interface RemainderOption {
    fulfillmentOrderId: string;
    number: number;
    /** What remains, per product, with the title the order froze. */
    lines: { productId: string; title: string; quantity: number }[];
}

/**
 * Every fulfillment order of an order with units still to cancel — only once something has shipped:
 * until then the whole order is cancelled instead, so there is no remainder to offer.
 *
 * @param orderId - the order
 * @param shipped - whether anything has shipped from the order (`order.fulfillment.shipped`)
 */
export const remainderOptions = (orderId: string, shipped: boolean): Promise<RemainderOption[]> =>
    shipped
        ? fulfillmentOrderRepository.findByOrderId(orderId).then((all) =>
              all
                  .filter(({ lines }) => remainderLines(lines).length > 0)
                  .map((fulfillmentOrder) => ({
                      fulfillmentOrderId: String(fulfillmentOrder._id),
                      number: fulfillmentOrder.number,
                      lines: fulfillmentOrder.lines
                          .filter((line) => remainingOfLine(line) > 0)
                          .map((line) => ({
                              productId: line.productId,
                              title: line.title,
                              quantity: remainingOfLine(line)
                          }))
                  }))
          )
        : Promise.resolve([]);

/**
 * Every shipment behind a set of orders — for the account data export, called with the caller's
 * own order ids. Not on `deliveryService`: that handle is for this module's own subscription and
 * admin surface, and this is the one narrow read a sibling may make instead.
 *
 * @param orderIds - the caller's own order ids
 */
export const findShipmentsForOrders = (orderIds: string[]): Promise<ShipmentDocument[]> =>
    orderIds.length === 0 ? Promise.resolve([]) : shipmentRepository.findByOrderIds(orderIds);

/**
 * Every fulfillment order behind a set of orders — the export's second section.
 *
 * @param orderIds - the caller's own order ids
 */
export const findFulfillmentOrdersForOrders = (
    orderIds: string[]
): Promise<FulfillmentOrderDocument[]> =>
    orderIds.length === 0
        ? Promise.resolve([])
        : fulfillmentOrderRepository.findByOrderIds(orderIds);

/**
 * Whether a fulfillment order's buyer was asked to keep waiting and the window has closed in
 * silence — read again by `returns` before it cancels, so an answer that came in after the sweep
 * announced the expiry is honoured. A fulfillment order that is gone, or no longer waiting for
 * stock, has no expired wait.
 *
 * @param fulfillmentOrderId - the fulfillment order
 * @param now - the instant to judge at; tests pass their own
 */
export const waitHasExpired = (
    fulfillmentOrderId: string,
    now: Date = new Date()
): Promise<boolean> =>
    fulfillmentOrderRepository
        .findById(fulfillmentOrderId)
        .then(
            (found) =>
                found !== null &&
                found.status === FulfillmentOrderStatus.on_hold &&
                hasWaitExpired(found, now)
        );
