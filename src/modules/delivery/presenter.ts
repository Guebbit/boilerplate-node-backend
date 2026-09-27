/**
 * @module
 * The one place a shipment document becomes the wire shape `openapi.yaml` declares.
 */

import type { Shipment } from '@types';
import type { ShipmentDocument } from './model';

/** The shipment as `openapi.yaml` declares it: `Shipment`, built rather than serialized. */
export const presentShipment = (shipment: ShipmentDocument): Shipment => ({
    id: String(shipment._id),
    orderId: String(shipment.orderId),
    status: shipment.status,
    ...(shipment.trackingCode ? { trackingCode: shipment.trackingCode } : {}),
    ...(shipment.deliveredAt ? { deliveredAt: shipment.deliveredAt.toISOString() } : {}),
    ...(shipment.createdAt ? { createdAt: shipment.createdAt.toISOString() } : {}),
    ...(shipment.updatedAt ? { updatedAt: shipment.updatedAt.toISOString() } : {})
});
