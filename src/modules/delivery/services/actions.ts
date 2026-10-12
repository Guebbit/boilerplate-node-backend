/**
 * @module
 * What a caller may do to a fulfillment order or a shipment, decided here so no client re-derives
 * the rules. Every flag needs the key that names the act (`delivery.any.update`) and a rank that
 * reaches the buyer; the buyer themselves, and anyone without the key, get all `false`. The state
 * half of each rule is pure and lives in `../domain`; this file adds the caller and the order.
 */

import { callerForSubject } from '@kernel/permissions';
import { holdsKey } from '@kernel/ability';
import { orderService } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import type {
    AuthContext,
    FulfillmentOrder,
    FulfillmentOrderActions,
    Shipment,
    ShipmentActions
} from '@types';
import { OrderStatus } from '@types';
import { isAwaitingAnswer, isFulfillable, isHoldable, isReleasable, isShippable } from '../domain';
import type { FulfillmentOrderDocument, ShipmentDocument } from '../model';
import { presentFulfillmentOrder, presentShipment } from '../presenter';

/** How the caller stands to an order: may they update fulfilment, and does their rank reach the buyer. */
export interface Standing {
    /** The caller holds `delivery.any.update`. */
    staff: boolean;
    /** The caller's rank reaches the order's buyer. */
    reaches: boolean;
    /** The caller is the order's own buyer — the one who may answer "keep waiting". */
    owner: boolean;
}

/**
 * How the caller stands to this order's fulfilment.
 * @param order - the order
 * @param authContext - the caller, or `undefined` for no request behind the read
 */
export const standingOn = (
    order: OrderDocument,
    authContext: AuthContext | undefined
): Promise<Standing> =>
    authContext
        ? orderService.reachesBuyer(order, authContext).then((reaches) => ({
              staff: holdsKey(callerForSubject(authContext, 'Shipment'), 'delivery.any.update'),
              reaches,
              owner: order.userId !== undefined && String(order.userId) === authContext.id
          }))
        : Promise.resolve({ staff: false, reaches: false, owner: false });

/**
 * The order's status is one a fulfilment act can still run from: `processing` for shipping and
 * delivering, `paid` or `processing` for holding.
 * @param status - the order's status
 * @param allowed - the statuses the act runs from
 */
const orderIn = (status: OrderStatus, allowed: readonly OrderStatus[]): boolean =>
    allowed.includes(status);

/**
 * What the caller may do to one fulfillment order.
 * @param fulfillmentOrder - the fulfillment order
 * @param order - the order it belongs to
 * @param standing - how the caller stands to it
 */
export const fulfillmentOrderActions = (
    fulfillmentOrder: FulfillmentOrderDocument,
    order: OrderDocument,
    standing: Standing
): FulfillmentOrderActions => {
    const may = standing.staff && standing.reaches;
    return {
        ship:
            may && orderIn(order.status, [OrderStatus.processing]) && isShippable(fulfillmentOrder),
        fulfill:
            may &&
            orderIn(order.status, [OrderStatus.processing]) &&
            isFulfillable(fulfillmentOrder),
        hold:
            may &&
            orderIn(order.status, [OrderStatus.paid, OrderStatus.processing]) &&
            isHoldable(fulfillmentOrder),
        release:
            may &&
            orderIn(order.status, [OrderStatus.paid, OrderStatus.processing]) &&
            isReleasable(fulfillmentOrder),
        confirmWait:
            standing.owner &&
            orderIn(order.status, [OrderStatus.paid, OrderStatus.processing]) &&
            isAwaitingAnswer(fulfillmentOrder)
    };
};

/**
 * What the caller may do to one shipment.
 * @param shipment - the shipment
 * @param order - the order it belongs to
 * @param standing - how the caller stands to it
 */
export const shipmentActions = (
    shipment: ShipmentDocument,
    order: OrderDocument,
    standing: Standing
): ShipmentActions => {
    const open =
        standing.staff &&
        standing.reaches &&
        shipment.status === 'shipped' &&
        orderIn(order.status, [OrderStatus.processing, OrderStatus.shipped]);
    return { deliver: open, editTracking: open };
};

/**
 * A fulfillment order as the wire carries it, for this caller.
 * @param fulfillmentOrder - the fulfillment order
 * @param order - the order it belongs to
 * @param authContext - the caller
 */
export const viewFulfillmentOrder = (
    fulfillmentOrder: FulfillmentOrderDocument,
    order: OrderDocument,
    authContext: AuthContext | undefined
): Promise<FulfillmentOrder> =>
    standingOn(order, authContext).then((standing) =>
        presentFulfillmentOrder(
            fulfillmentOrder,
            fulfillmentOrderActions(fulfillmentOrder, order, standing),
            standing.staff
        )
    );

/**
 * A shipment as the wire carries it, for this caller.
 * @param shipment - the shipment
 * @param order - the order it belongs to
 * @param authContext - the caller
 */
export const viewShipment = (
    shipment: ShipmentDocument,
    order: OrderDocument,
    authContext: AuthContext | undefined
): Promise<Shipment> =>
    standingOn(order, authContext).then((standing) =>
        presentShipment(shipment, shipmentActions(shipment, order, standing))
    );
