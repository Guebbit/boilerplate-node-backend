/**
 * @module
 * Whether a shipment is still waiting for the carrier's code — the one rule behind the
 * `Shipment.awaitingTracking` flag and the staff digest's "tracked, still without a code" row.
 */

import { FulfillmentOrderKind, ShipmentStatus } from '@types';
import { findShippingMethod } from './rates';

/** The facts of a shipment the question reads. */
export interface TrackingFacts {
    /** `physical` for a parcel; a digital fulfilment never had a carrier. */
    kind: FulfillmentOrderKind;
    status: ShipmentStatus;
    trackingCode?: string | undefined;
}

/**
 * Whether the shipment left on a tracked method and still has no code: a physical parcel, still
 * `shipped`, whose method says `tracked`. The method is looked up live, not frozen at checkout, so
 * a rate change also changes who is waiting.
 * @param shipment - the shipment's facts
 * @param shippingMethodId - the order's shipping method id, when it has one
 */
export const isAwaitingTracking = (
    shipment: TrackingFacts,
    shippingMethodId: string | undefined
): boolean =>
    shipment.kind === FulfillmentOrderKind.physical &&
    shipment.status === ShipmentStatus.shipped &&
    !shipment.trackingCode &&
    shippingMethodId !== undefined &&
    findShippingMethod(shippingMethodId)?.tracked === true;
