/**
 * @module
 * What a caller may do to a fulfillment order or a shipment, decided here so no client re-derives
 * the rules. Every flag needs the key that names the act (`update:Shipment`); anyone without
 * it gets all `false`. The state half of each rule is pure and lives in `../domain`; this file
 * adds the caller and the order.
 */

import { callerForSubject } from '@kernel/permissions';
import { holds } from '@kernel/ability';
import { canRecordArrival, canShip, isAwaitingGoods, isBuyer } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import type {
    AuthContext,
    FulfillmentOrder,
    FulfillmentOrderActions,
    Shipment,
    ShipmentActions
} from '@types';
import { isAwaitingAnswer, isFulfillable, isHoldable, isReleasable, isShippable } from '../domain';
import type { FulfillmentOrderDocument, ShipmentDocument } from '../model';
import { presentFulfillmentOrder, presentShipment } from '../presenter';

/** How the caller stands to an order: may they update fulfilment, and are they its buyer. */
export interface Standing {
    /** The caller holds `update:Shipment`. */
    staff: boolean;
    /** The caller is the order's own buyer — the one who may answer "keep waiting". */
    owner: boolean;
}

/**
 * How the caller stands to this order's fulfilment.
 * @param order - the order
 * @param authContext - the caller, or `undefined` for no request behind the read
 */
export const standingOn = (order: OrderDocument, authContext: AuthContext | undefined): Standing =>
    authContext
        ? {
              staff: holds(callerForSubject(authContext, 'Shipment'), 'update', 'Shipment'),
              owner: isBuyer(order, authContext)
          }
        : { staff: false, owner: false };

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
    const may = standing.staff;
    return {
        ship: may && canShip(order.status) && isShippable(fulfillmentOrder),
        fulfill: may && canShip(order.status) && isFulfillable(fulfillmentOrder),
        hold: may && isAwaitingGoods(order.status) && isHoldable(fulfillmentOrder),
        release: may && isAwaitingGoods(order.status) && isReleasable(fulfillmentOrder),
        confirmWait:
            standing.owner && isAwaitingGoods(order.status) && isAwaitingAnswer(fulfillmentOrder)
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
    const open = standing.staff && shipment.status === 'shipped' && canRecordArrival(order.status);
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
): FulfillmentOrder => {
    const standing = standingOn(order, authContext);

    return presentFulfillmentOrder(
        fulfillmentOrder,
        fulfillmentOrderActions(fulfillmentOrder, order, standing),
        standing.staff
    );
};

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
): Shipment =>
    presentShipment(shipment, shipmentActions(shipment, order, standingOn(order, authContext)));
