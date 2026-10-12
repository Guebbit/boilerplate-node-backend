/**
 * @module
 * The one place a delivery document becomes the wire shape `openapi.yaml` declares. Built rather
 * than serialized: a stored line carries no `remaining`, and the caller's `actions` and the staff-only
 * hold note are decided per request.
 */

import type {
    PreorderFulfillmentOrder,
    PreorderProductSummary,
    FulfillmentOrder,
    FulfillmentOrderActions,
    Shipment,
    ShipmentActions,
    ExportShipment,
    ExportFulfillmentOrder
} from '@types';
import { boardStateOf, isLate, remainingOfLine, slippedDays } from './domain';
import type { ProductSummaryRow } from './repository';
import type { OrderBrief } from '@modules/orders';
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
        : {}),
    ...(fulfillmentOrder.consent ? { consent: fulfillmentOrder.consent } : {}),
    ...(fulfillmentOrder.consentDeadline
        ? { consentDeadline: fulfillmentOrder.consentDeadline.toISOString() }
        : {}),
    ...(fulfillmentOrder.lastNoticeAt
        ? { lastNoticeAt: fulfillmentOrder.lastNoticeAt.toISOString() }
        : {}),
    ...(fulfillmentOrder.cancelReason ? { cancelReason: fulfillmentOrder.cancelReason } : {})
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

/**
 * One fulfillment order of a preorder as the board carries it: the record, its buyer and when the
 * order was paid, and the two judgements the board filters by.
 *
 * @param fulfillmentOrder - the stored fulfillment order
 * @param brief - its order's buyer and payment, as `orders` gives them out
 * @param delivered - whether every shipment cut from it has arrived
 * @param now - the instant `late` is judged at
 */
export const presentPreorderFulfillmentOrder = (
    fulfillmentOrder: FulfillmentOrderDocument,
    brief: OrderBrief | undefined,
    delivered: boolean,
    now: Date
): PreorderFulfillmentOrder => ({
    id: String(fulfillmentOrder._id),
    orderId: String(fulfillmentOrder.orderId),
    orderNumber: brief?.orderNumber ?? '',
    number: fulfillmentOrder.number,
    status: fulfillmentOrder.status,
    state: boardStateOf(fulfillmentOrder),
    lines: presentLines(fulfillmentOrder.lines),
    buyer: {
        email: brief?.email ?? '',
        ...(brief?.userId ? { userId: brief.userId } : {})
    },
    ...(brief?.paidAt ? { paidAt: brief.paidAt.toISOString() } : {}),
    ...(fulfillmentOrder.agreedAt ? { agreedAt: fulfillmentOrder.agreedAt.toISOString() } : {}),
    ...(fulfillmentOrder.expectedAt
        ? { expectedAt: fulfillmentOrder.expectedAt.toISOString() }
        : {}),
    slippedDays:
        fulfillmentOrder.agreedAt && fulfillmentOrder.expectedAt
            ? slippedDays(fulfillmentOrder.agreedAt, fulfillmentOrder.expectedAt)
            : 0,
    late: isLate(fulfillmentOrder, now),
    delivered,
    ...(fulfillmentOrder.holdReason ? { holdReason: fulfillmentOrder.holdReason } : {}),
    ...(fulfillmentOrder.consent ? { consent: fulfillmentOrder.consent } : {}),
    ...(fulfillmentOrder.consentDeadline
        ? { consentDeadline: fulfillmentOrder.consentDeadline.toISOString() }
        : {}),
    ...(fulfillmentOrder.lastNoticeAt
        ? { lastNoticeAt: fulfillmentOrder.lastNoticeAt.toISOString() }
        : {}),
    ...(fulfillmentOrder.cancelReason ? { cancelReason: fulfillmentOrder.cancelReason } : {}),
    createdAt: (fulfillmentOrder.createdAt ?? new Date(0)).toISOString()
});

/**
 * A product's preorder units as the board's Products tab carries them.
 * @param row - the aggregation's row
 */
export const presentProductSummary = (row: ProductSummaryRow): PreorderProductSummary => ({
    productId: row.productId,
    title: row.title,
    firstAgreedAt: row.firstAgreedAt.toISOString(),
    paid: row.paid,
    waiting: row.waiting,
    awaitingYes: row.awaitingYes,
    allocated: row.allocated,
    shipped: row.shipped,
    cancelled: row.cancelled,
    late: row.late
});
