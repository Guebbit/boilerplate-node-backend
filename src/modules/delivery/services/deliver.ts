/**
 * @module
 * Staff recording a shipment's arrival — the delivery door. The shipment is stamped, the order's
 * summary recomputed and, when this was the last undelivered shipment with nothing left to ship,
 * the order moves to `delivered` and its withdrawal clock starts from THAT arrival (CRD Art.
 * 9(2)(b)(i): the last good) — all in one transaction, with `shipment.delivered`.
 *
 * See: docs/modules/delivery.md#delivering
 */

import type { ClientSession } from 'mongoose';
import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { orderService } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { OrderStatus } from '@types';
import type { AuthContext, CallerContext, Shipment } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { deliveryAuditActions } from '../audit';
import { shipmentRepository } from '../repository';
import type { ShipmentDocument } from '../model';
import { refuse, refuseMissing, runAct } from './act';
import { viewShipment } from './actions';
import { announceDelivered } from './announce';
import { refuseUnearnedForce } from './force';
import { notifyDelivered } from './notify';
import { reportProgress, settleOrder } from './progress';

/** What staff sends to record an arrival. */
export interface DeliverInput {
    /** Record it without a carrier confirmation. Needs `override:Order` and a `reason`. */
    forced?: boolean | undefined;
    /** Why; recorded on the order's override history. */
    reason?: string | undefined;
}

/** What a committed delivery leaves for the steps that follow it. */
interface Delivered {
    shipment: ShipmentDocument;
    order: OrderDocument;
}

/**
 * The act itself, in its transaction.
 * @param shipmentId - the shipment that arrived
 * @param input - the `forced` flag and its reason
 * @param context - the caller
 * @param session - the act's transaction
 */
const deliverAct = async (
    shipmentId: string,
    input: DeliverInput,
    context: CallerContext,
    session: ClientSession
): Promise<Delivered> => {
    const found = await shipmentRepository.findInSession(shipmentId, session);
    if (!found) return refuseMissing('delivery.shipment-not-found');
    const orderId = String(found.orderId);

    const order = await orderService.readOrder(orderId, session);
    if (!order) return refuseMissing('delivery.order-not-found');
    // Only an order with goods out can take an arrival; `delivered` and `cancelled` are over.
    if (order.status !== OrderStatus.processing && order.status !== OrderStatus.shipped)
        refuse(409, ERROR_CODES.DELIVERY_NOT_DELIVERABLE, 'delivery.not-deliverable');

    // One instant for the shipment and, when it completes the order, the withdrawal deadline: the
    // two must never disagree about when the goods arrived.
    const at = new Date();
    const shipment = await shipmentRepository.markDelivered(shipmentId, at, session);
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
    if (input.forced)
        await orderService.recordForcedFulfilment(
            orderId,
            {
                reason: input.reason ?? '',
                actorUserId: context.caller.id ?? '',
                at,
                from: order.status
            },
            session
        );
    await announceDelivered(shipment, session, context.caller.id);

    return { shipment, order };
};

/**
 * Record a shipment's arrival.
 *
 * @param shipmentId - the shipment that arrived
 * @param input - the `forced` flag and its reason
 * @param authContext - the caller, for the response's own `actions`
 * @param context - the caller, for the audit entry
 * @returns the shipment as it now stands, or the refusal naming which case it was
 */
export const deliverShipment = (
    shipmentId: string,
    input: DeliverInput,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<Shipment> | ResponseReject> => {
    const unearned = refuseUnearnedForce(context, input.forced, input.reason);
    if (unearned) return Promise.resolve(unearned);

    return shipmentRepository.findById(shipmentId).then((found) => {
        if (!found) return generateReject(404, [t('delivery.shipment-not-found')]);

        return orderService.getById(String(found.orderId)).then((order) => {
            if (!order) return generateReject(404, [t('delivery.order-not-found')]);

            return runAct((session) => deliverAct(shipmentId, input, context, session)).then(
                (result) => {
                    if (result.refused) return result.reject;
                    const { shipment } = result.value;
                    return notifyDelivered(String(shipment.orderId), shipment)
                        .then(() => {
                            recordAudit(context, {
                                action: deliveryAuditActions.ADMIN_ORDER_DELIVERED,
                                outcome: 'success',
                                targetType: 'order',
                                targetId: String(shipment.orderId),
                                metadata: { shipmentId, forced: input.forced === true }
                            });
                        })
                        .then(() =>
                            generateSuccess(viewShipment(shipment, result.value.order, authContext))
                        );
                }
            );
        });
    });
};
