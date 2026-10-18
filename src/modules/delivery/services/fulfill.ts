/**
 * @module
 * The digital act: fulfilling a `digital` fulfillment order with no parcel to carry. It cuts a
 * shipment with no tracking, born AND delivered in the same write (Shopify fulfils digital lines
 * without shipping too), and — when nothing else remains or is still out — completes the order in
 * one transaction, its withdrawal clock counted from payment (digital content, Art. 9(2)(c)).
 *
 * See: docs/modules/delivery.md#digital-fulfilment
 */

import type { ClientSession } from 'mongoose';
import {
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
import { isFulfillable, remainderLines } from '../domain';
import { deliveryAuditActions } from '../audit';
import type { ShipmentDocument } from '../model';
import { readWithOrder, refuse, runAct } from './act';
import { viewShipment } from './actions';
import { announceDelivered, announceShipped } from './announce';
import { cutShipment } from './cut';
import { reportProgress, settleOrder } from './progress';

/** What a committed fulfilment leaves for the steps that follow it. */
interface Fulfilled {
    shipment: ShipmentDocument;
    order: OrderDocument;
}

/**
 * The act itself, in its transaction.
 * @param fulfillmentOrderId - the digital fulfillment order
 * @param session - the act's transaction
 * @param actor - the staff member fulfilling it, for the order's timeline
 */
const fulfillAct = async (
    fulfillmentOrderId: string,
    session: ClientSession,
    actor: string | null | undefined
): Promise<Fulfilled> => {
    const { fulfillmentOrder, order } = await readWithOrder(fulfillmentOrderId, session);
    const orderId = String(fulfillmentOrder.orderId);
    if (order.status !== OrderStatus.processing)
        refuse(409, ERROR_CODES.ORDER_NOT_PROCESSING, 'delivery.not-processing');
    if (fulfillmentOrder.kind !== 'digital')
        refuse(409, ERROR_CODES.DELIVERY_NOT_DIGITAL, 'delivery.not-digital');
    if (!isFulfillable(fulfillmentOrder))
        refuse(409, ERROR_CODES.DELIVERY_NOT_SHIPPABLE, 'delivery.not-shippable');

    const at = new Date();
    const { shipment } = await cutShipment(
        {
            fulfillmentOrder,
            lines: remainderLines(fulfillmentOrder.lines),
            forced: false,
            delivered: true,
            at,
            takeStock: true
        },
        session
    );
    const progress = await reportProgress(orderId, session);
    await settleOrder(orderId, progress.order.status, progress.summary, at, session, actor);
    await announceShipped(shipment, session, actor);
    await announceDelivered(shipment, session, actor);

    return { shipment, order };
};

/**
 * Fulfil a digital fulfillment order.
 *
 * @param fulfillmentOrderId - the digital fulfillment order
 * @param authContext - the caller, for the response's own `actions`
 * @param context - the caller, for the audit entry
 * @returns the shipment, already delivered, or the refusal naming which case it was
 */
export const fulfillFulfillmentOrder = (
    fulfillmentOrderId: string,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<Shipment> | ResponseReject> =>
    runAct((session) => fulfillAct(fulfillmentOrderId, session, context.caller.id)).then(
        (result) => {
            if (result.refused) return result.reject;
            const { shipment } = result.value;
            return orderService
                .refreshShelf(shipment.lines.map(({ productId }) => productId))
                .then(() => {
                    recordAudit(context, {
                        action: deliveryAuditActions.ADMIN_ORDER_FULFILLED,
                        outcome: 'success',
                        targetType: 'order',
                        targetId: String(shipment.orderId),
                        metadata: { shipmentId: String(shipment._id) }
                    });
                })
                .then(() =>
                    generateSuccess(viewShipment(shipment, result.value.order, authContext))
                );
        }
    );
