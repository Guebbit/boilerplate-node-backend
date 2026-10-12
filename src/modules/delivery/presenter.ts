/**
 * @module
 * The one place a delivery document becomes the wire shape `openapi.yaml` declares. Built rather
 * than serialized: a stored line carries no `remaining`, and the caller's `actions` and the staff-only
 * hold note are decided per request.
 */

import type {
    FulfillmentOrder,
    FulfillmentOrderActions,
    Shipment,
    ShipmentActions,
    ExportShipment,
    ExportFulfillmentOrder
} from '@types';
import { remainingOfLine } from './domain';
import type { FulfillmentOrderDocument, ShipmentDocument } from './model';

/**
 * The lines of a fulfillment order as the wire carries them, with `remaining` computed here so no
 * client counts.
 * @param lines - the stored lines
 */
const presentLines = (lines: FulfillmentOrderDocument['lines']): FulfillmentOrder['lines'] =>
    lines.map((line) => ({
        productId: line.productId,
        title: line.title,
        quantity: line.quantity,
        shippedQuantity: line.shippedQuantity,
        cancelledQuantity: line.cancelledQuantity,
        remaining: remainingOfLine(line)
    }));

/**
 * The shipment as `openapi.yaml` declares it, with the caller's `actions`.
 * @param shipment - the stored shipment
 * @param actions - what this caller may do to it
 */
export const presentShipment = (
    shipment: ShipmentDocument,
    actions: ShipmentActions
): Shipment => ({
    ...presentExportShipment(shipment),
    forced: shipment.forced,
    actions,
    ...(shipment.createdAt ? { createdAt: shipment.createdAt.toISOString() } : {}),
    ...(shipment.updatedAt ? { updatedAt: shipment.updatedAt.toISOString() } : {})
});

/**
 * The shipment as an account export carries it: the record, with no `actions` and no `forced`.
 * @param shipment - the stored shipment
 */
export const presentExportShipment = (shipment: ShipmentDocument): ExportShipment => ({
    id: String(shipment._id),
    orderId: String(shipment.orderId),
    fulfillmentOrderId: String(shipment.fulfillmentOrderId),
    number: shipment.number,
    status: shipment.status,
    lines: shipment.lines.map(({ productId, title, quantity }) => ({
        productId,
        title,
        quantity
    })),
    shippedAt: shipment.shippedAt.toISOString(),
    ...(shipment.trackingCode ? { trackingCode: shipment.trackingCode } : {}),
    ...(shipment.deliveredAt ? { deliveredAt: shipment.deliveredAt.toISOString() } : {})
});

/**
 * The fulfillment order as an account export carries it. Staff's hold note is not the buyer's data
 * and is left out.
 * @param fulfillmentOrder - the stored fulfillment order
 */
export const presentExportFulfillmentOrder = (
    fulfillmentOrder: FulfillmentOrderDocument
): ExportFulfillmentOrder => ({
    id: String(fulfillmentOrder._id),
    orderId: String(fulfillmentOrder.orderId),
    number: fulfillmentOrder.number,
    kind: fulfillmentOrder.kind,
    status: fulfillmentOrder.status,
    lines: presentLines(fulfillmentOrder.lines),
    ...(fulfillmentOrder.holdReason ? { holdReason: fulfillmentOrder.holdReason } : {}),
    ...(fulfillmentOrder.agreedAt ? { agreedAt: fulfillmentOrder.agreedAt.toISOString() } : {}),
    ...(fulfillmentOrder.expectedAt
        ? { expectedAt: fulfillmentOrder.expectedAt.toISOString() }
        : {})
});

/**
 * The fulfillment order as `openapi.yaml` declares it, with the caller's `actions`.
 * @param fulfillmentOrder - the stored fulfillment order
 * @param actions - what this caller may do to it
 * @param showNote - whether the caller may read staff's hold note
 */
export const presentFulfillmentOrder = (
    fulfillmentOrder: FulfillmentOrderDocument,
    actions: FulfillmentOrderActions,
    showNote: boolean
): FulfillmentOrder => ({
    ...presentExportFulfillmentOrder(fulfillmentOrder),
    actions,
    ...(showNote && fulfillmentOrder.holdNote ? { holdNote: fulfillmentOrder.holdNote } : {}),
    createdAt: (fulfillmentOrder.createdAt ?? new Date(0)).toISOString(),
    ...(fulfillmentOrder.updatedAt ? { updatedAt: fulfillmentOrder.updatedAt.toISOString() } : {})
});
