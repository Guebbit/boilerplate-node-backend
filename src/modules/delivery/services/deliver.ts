/**
 * @module
 * Staff recording a shipment's arrival — the delivery door. The shipment is stamped, the order's
 * summary recomputed and, when this was the last undelivered shipment with nothing left to ship,
 * the order moves to `delivered` and its withdrawal clock starts from THAT arrival (CRD Art.
 * 9(2)(b)(i): the last good) — all in one transaction, with `shipment.delivered`.
 *
 * A `lost` shipment that turns up is accepted too, when every unit on it is still open
 * ({@link restoreLostShipment}): the same door for the same real-world fact.
 *
 * See: docs/modules/delivery.md#delivering
 */

import type { ClientSession } from 'mongoose';
import {
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { canRecordArrival, orderService } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { ShipmentStatus } from '@types';
import type { AuthContext, CallerContext, Shipment } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { deliveryAuditActions } from '../audit';
import { shipmentRepository } from '../repository';
import type { ShipmentDocument } from '../model';
import { refuse, refuseMissing, runAct } from './act';
import { announceDelivered } from './announce';
import { restoreLostShipment, viewShipmentOf } from './found';
import { reportProgress, settleOrder } from './progress';

/** What a committed delivery leaves for the steps that follow it. */
interface Delivered {
    shipment: ShipmentDocument;
    order: OrderDocument;
    /** The shipment had been reported lost and turned up. */
    wasLost: boolean;
}

/**
 * The act itself, in its transaction.
 * @param shipmentId - the shipment that arrived
 * @param context - the caller
 * @param session - the act's transaction
 */
const deliverAct = async (
    shipmentId: string,
    context: CallerContext,
    session: ClientSession
): Promise<Delivered> => {
    const found = await shipmentRepository.findInSession(shipmentId, session);
    if (!found) return refuseMissing('delivery.shipment-not-found');
    const orderId = String(found.orderId);

    const order = await orderService.readOrder(orderId, session);
    if (!order) return refuseMissing('delivery.order-not-found');
    // Only an order with goods out can take an arrival; `delivered` and `cancelled` are over.
    if (!canRecordArrival(order.status))
        refuse(409, ERROR_CODES.DELIVERY_NOT_DELIVERABLE, 'delivery.not-deliverable');

    // One instant for the shipment and, when it completes the order, the withdrawal deadline: the
    // two must never disagree about when the goods arrived.
    const at = new Date();
    const wasLost = found.status === ShipmentStatus.lost;
    const shipment = wasLost
        ? await restoreLostShipment(found, at, session)
        : await shipmentRepository.markDelivered(shipmentId, at, session);
    if (!shipment)
        return refuse(409, ERROR_CODES.DELIVERY_NOT_DELIVERABLE, 'delivery.not-deliverable');

    const progress = await reportProgress(orderId, session);
    await settleOrder(
        orderId,
        progress.order.status,
        progress.summary,
        progress.summary.lastDeliveredAt ?? at,
        session,
        context.caller.id
    );
    await announceDelivered(shipment, session, context.caller.id);

    return { shipment, order, wasLost };
};

/**
 * Record a shipment's arrival.
 *
 * @param shipmentId - the shipment that arrived
 * @param authContext - the caller, for the response's own `actions`
 * @param context - the caller, for the audit entry
 * @returns the shipment as it now stands, or the refusal naming which case it was
 */
export const deliverShipment = (
    shipmentId: string,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<Shipment> | ResponseReject> => {
    return runAct((session) => deliverAct(shipmentId, context, session)).then((result) => {
        if (result.refused) return result.reject;
        const { shipment } = result.value;
        const lostFlag = result.value.wasLost ? { wasLost: true } : {};
        recordAudit(context, {
            action: deliveryAuditActions.ADMIN_ORDER_DELIVERED,
            outcome: 'success',
            targetType: 'order',
            targetId: String(shipment.orderId),
            metadata: { shipmentId, ...lostFlag }
        });
        // A restore moved the stock hold: the catalogue's copy follows the commit.
        const shelf = result.value.wasLost
            ? orderService.refreshShelf(shipment.lines.map(({ productId }) => productId))
            : Promise.resolve();
        return shelf.then(() =>
            viewShipmentOf(shipment, result.value.order, authContext).then((view) =>
                generateSuccess(view)
            )
        );
    });
};
