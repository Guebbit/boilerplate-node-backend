/**
 * @module
 * What a caller may do to a fulfillment order or a shipment, decided here so no client re-derives
 * the rules. Every flag needs the key that names the act (`update:Shipment`); anyone without
 * it gets all `false`. The state half of each rule is pure and lives in `../domain`; this file
 * adds the caller and the order.
 */

import { callerForSubject } from '@kernel/permissions';
import { holds } from '@kernel/ability';
import { canRecordArrival, isAwaitingGoods } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { isOpenForShipment } from './ship-gate';
import { FulfillmentOrderKind, ShipmentStatus } from '@types';
import type {
    AuthContext,
    FulfillmentOrder,
    FulfillmentOrderActions,
    Shipment,
    ShipmentActions
} from '@types';
import {
    isAwaitingTracking,
    isFulfillable,
    isHoldable,
    isReleasable,
    isShippable
} from '../domain';
import type { FulfillmentOrderDocument, ShipmentDocument } from '../model';
import { presentFulfillmentOrder, presentShipment } from '../presenter';

/** How the caller stands to an order: may they update fulfilment or start it. */
export interface Standing {
    /** The caller holds `update:Shipment`. */
    staff: boolean;
    /** The caller holds `start:Shipment`: shipping from `paid` makes the start move itself. */
    start: boolean;
}

/**
 * How the caller stands to a fulfilment.
 * @param authContext - the caller, or `undefined` for no request behind the read
 */
export const standingOn = (authContext: AuthContext | undefined): Standing =>
    authContext
        ? {
              staff: holds(callerForSubject(authContext, 'Shipment'), 'update', 'Shipment'),
              start: holds(callerForSubject(authContext, 'Shipment'), 'start', 'Shipment')
          }
        : { staff: false, start: false };

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
    const open = may && isOpenForShipment(order.status, standing.start);
    return {
        ship: open && isShippable(fulfillmentOrder),
        fulfill: open && isFulfillable(fulfillmentOrder),
        hold: may && isAwaitingGoods(order.status) && isHoldable(fulfillmentOrder),
        release: may && isAwaitingGoods(order.status) && isReleasable(fulfillmentOrder)
    };
};

/**
 * What the caller may do to one shipment.
 * @param shipment - the shipment
 * @param order - the order it belongs to
 * @param standing - how the caller stands to it
 * @param restorable - for a `lost` shipment: whether every unit on it is still open (see `./found`)
 */
export const shipmentActions = (
    shipment: ShipmentDocument,
    order: OrderDocument,
    standing: Standing,
    restorable = false
): ShipmentActions => {
    const mayAct = standing.staff && canRecordArrival(order.status);
    // A `lost` parcel may still arrive while every unit on it is open: the caller says whether.
    const open =
        mayAct &&
        (shipment.status === ShipmentStatus.shipped ||
            (shipment.status === ShipmentStatus.lost && restorable));
    return {
        deliver: open,
        // The tracking code is a record staff may fix at any time, once and after arrival, on a parcel.
        update: standing.staff && shipment.kind === FulfillmentOrderKind.physical,
        markLost:
            mayAct &&
            shipment.status === ShipmentStatus.shipped &&
            shipment.kind === FulfillmentOrderKind.physical
    };
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
    const standing = standingOn(authContext);

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
 * @param restorable - for a `lost` shipment: whether it can still be recorded as arrived
 */
export const viewShipment = (
    shipment: ShipmentDocument,
    order: OrderDocument,
    authContext: AuthContext | undefined,
    restorable = false
): Shipment => presentShipmentFor(shipment, order, standingOn(authContext), restorable);

/**
 * A shipment as the wire carries it, for a caller whose standing is already known — the list read
 * works that out once for every row.
 * @param shipment - the shipment
 * @param order - the order it belongs to
 * @param standing - how the caller stands to it
 * @param restorable - for a `lost` shipment: whether it can still be recorded as arrived
 */
export const presentShipmentFor = (
    shipment: ShipmentDocument,
    order: OrderDocument,
    standing: Standing,
    restorable = false
): Shipment =>
    presentShipment(
        shipment,
        shipmentActions(shipment, order, standing, restorable),
        isAwaitingTracking(shipment, order.shippingMethod),
        standing.staff
    );
