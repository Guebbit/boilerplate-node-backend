/**
 * @module
 * The four figures the daily staff digest reads off delivery: preorders past their date, holds
 * open too long, tracked parcels still without a code, and parcels shipped and never marked
 * arrived. Counts only, so the digest holds no shipment data.
 *
 * See: docs/modules/notifications.md#the-daily-digest
 */

import { orderService } from '@modules/orders';
import {
    FulfillmentHoldReason,
    FulfillmentOrderKind,
    FulfillmentOrderStatus,
    ShipmentStatus
} from '@types';
import { DAY_MS, HOUR_MS } from '@domain-primitives/time';
import { isAwaitingTracking } from '../domain';
import { fulfillmentOrderRepository, shipmentRepository } from '../repository';

/** What the digest counts on the delivery side. */
export interface DeliveryDigest {
    /** Waiting fulfillment orders whose expected date passed with units still owed. */
    preordersLate: number;
    /** Fulfillment orders held for a staff reason longer than the allowance. */
    holdsOpen: number;
    /** Shipped parcels on a tracked method with no code after the allowance. */
    awaitingTracking: number;
    /** Physical parcels shipped and not marked arrived after the allowance. */
    undelivered: number;
}

/** How long a thing waits before it is counted. */
export interface DeliveryDigestAllowance {
    holdDays: number;
    trackingHours: number;
    undeliveredDays: number;
}

/** Parcels examined for a missing code at most: the count of an unbounded backlog is not exact. */
const TRACKING_SCAN_LIMIT = 1000;

/**
 * Shipped physical parcels without a code since before the cutoff whose order's method is tracked.
 * The method lives on the order, so the order is asked once for the whole batch.
 */
const countAwaitingTracking = async (cutoff: Date): Promise<number> => {
    const shipments = await shipmentRepository.findAll(
        {
            kind: FulfillmentOrderKind.physical,
            status: ShipmentStatus.shipped,
            trackingCode: { $exists: false },
            shippedAt: { $lte: cutoff }
        },
        { limit: TRACKING_SCAN_LIMIT }
    );
    const methodOf = await orderService.shippingMethodsOf(
        shipments.map(({ orderId }) => String(orderId))
    );
    return shipments.filter((shipment) =>
        isAwaitingTracking(shipment, methodOf.get(String(shipment.orderId)))
    ).length;
};

/**
 * Count what delivery owes staff attention to.
 *
 * @param now - the instant the allowances are measured from
 * @param allowance - how long each kind of thing may wait
 */
export const deliveryDigest = (
    now: Date,
    { holdDays, trackingHours, undeliveredDays }: DeliveryDigestAllowance
): Promise<DeliveryDigest> =>
    Promise.all([
        fulfillmentOrderRepository
            .searchBoard({ late: true }, now, { skip: 0, limit: 1 })
            .then(({ totalItems }) => totalItems),
        fulfillmentOrderRepository.count({
            status: FulfillmentOrderStatus.on_hold,
            holdReason: {
                $in: Object.values(FulfillmentHoldReason).filter((r) => r !== 'awaiting_stock')
            },
            heldAt: { $lte: new Date(now.getTime() - holdDays * DAY_MS) }
        }),
        countAwaitingTracking(new Date(now.getTime() - trackingHours * HOUR_MS)),
        shipmentRepository.count({
            kind: FulfillmentOrderKind.physical,
            status: ShipmentStatus.shipped,
            shippedAt: { $lte: new Date(now.getTime() - undeliveredDays * DAY_MS) }
        })
    ]).then(([preordersLate, holdsOpen, awaitingTracking, undelivered]) => ({
        preordersLate,
        holdsOpen,
        awaitingTracking,
        undelivered
    }));
