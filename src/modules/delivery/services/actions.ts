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
import { FulfillmentOrderKind } from '@types';
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

/** How the caller stands to an order: may they update fulfilment, start it, force an arrival. */
export interface Standing {
    /** The caller holds `update:Shipment`. */
    staff: boolean;
    /** The caller holds `start:Shipment`: shipping from `paid` makes the start move itself. */
    start: boolean;
    /** The caller holds `override:Order`: the forced arrival. */
    override: boolean;
}

/**
 * How the caller stands to a fulfilment.
 * @param authContext - the caller, or `undefined` for no request behind the read
 */
export const standingOn = (authContext: AuthContext | undefined): Standing =>
    authContext
        ? {
              staff: holds(callerForSubject(authContext, 'Shipment'), 'update', 'Shipment'),
              start: holds(callerForSubject(authContext, 'Shipment'), 'start', 'Shipment'),
              override: holds(callerForSubject(authContext, 'Order'), 'override', 'Order')
          }
        : { staff: false, start: false, override: false };

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
 */
export const shipmentActions = (
    shipment: ShipmentDocument,
    order: OrderDocument,
    standing: Standing
): ShipmentActions => {
    const open = standing.staff && shipment.status === 'shipped' && canRecordArrival(order.status);
    // The forced arrival has the same state gate as the ordinary one; it adds the override key.
    return {
        deliver: open,
        forceDeliver: open && standing.override,
        // The tracking code is a record staff may fix at any time, once and after arrival, on a parcel.
        update: standing.staff && shipment.kind === FulfillmentOrderKind.physical
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
 */
export const viewShipment = (
    shipment: ShipmentDocument,
    order: OrderDocument,
    authContext: AuthContext | undefined
): Shipment => presentShipmentFor(shipment, order, standingOn(authContext));

/**
 * A shipment as the wire carries it, for a caller whose standing is already known — the list read
 * works that out once for every row.
 * @param shipment - the shipment
 * @param order - the order it belongs to
 * @param standing - how the caller stands to it
 */
export const presentShipmentFor = (
    shipment: ShipmentDocument,
    order: OrderDocument,
    standing: Standing
): Shipment =>
    presentShipment(
        shipment,
        shipmentActions(shipment, order, standing),
        isAwaitingTracking(shipment, order.shippingMethod)
    );
