/**
 * @module
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 */

/**
 * The doors staff writes through: starting fulfilment, cutting a shipment, recording an arrival,
 * fulfilling a digital fulfillment order, correcting a tracking code, reporting a parcel lost, and holding or releasing a
 * fulfillment order.
 *
 * Metadata, where it says more than the target:
 * - delivered: `forced`, and the operator's `reason` when it was forced (a sanctioned bypass; the
 *   reason is its justification).
 * - tracking_edited: `changes.trackingCode` `{from, to}` — only when the code really changed.
 * - held, released: the hold's reason code, never `holdNote` (free text, optional commentary).
 * - lost: the reason code, never `lostNote` or `lostMessage`.
 * - delivered: `wasLost` when the shipment had been reported lost and turned up.
 */
export const deliveryAuditActions = {
    ADMIN_ORDER_FULFILMENT_STARTED: 'admin.order.fulfilment_started',
    ADMIN_ORDER_SHIPPED: 'admin.order.shipped',
    ADMIN_ORDER_DELIVERED: 'admin.order.delivered',
    ADMIN_ORDER_FULFILLED: 'admin.order.fulfilled',
    ADMIN_SHIPMENT_TRACKING_EDITED: 'admin.shipment.tracking_edited',
    ADMIN_SHIPMENT_LOST: 'admin.shipment.lost',
    ADMIN_FULFILLMENT_ORDER_HELD: 'admin.fulfillment_order.held',
    ADMIN_FULFILLMENT_ORDER_RELEASED: 'admin.fulfillment_order.released'
} as const;

/** Registers this module's action shape into the shared `AuditActionMap`. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        delivery: (typeof deliveryAuditActions)[keyof typeof deliveryAuditActions];
    }
}
