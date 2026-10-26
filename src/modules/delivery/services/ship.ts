/**
 * @module
 * Staff cutting a shipment from a fulfillment order — the shipping door. Everything it changes
 * commits in ONE transaction: the fulfillment order's lines, the shipment, the units leaving the
 * shelf, the order's summary and (when this shipment leaves nothing behind) its status, and
 * `shipment.shipped`. The mail and the audit row follow the commit.
 *
 * A `paid` order ships too: the act makes the `paid → processing` move itself, so the caller needs
 * `start:Shipment` as well as `update:Shipment`. Nothing ships from `on_hold`.
 *
 * See: docs/modules/delivery.md#shipping
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
import { checkShipLines, isShippable } from '../domain';
import {
    auditUnearnedStart,
    isOpenForShipment,
    mayStartFulfilment,
    refuseUnearnedStart
} from './ship-gate';
import type { ProductQuantity } from '../domain';
import { deliveryAuditActions } from '../audit';
import type { FulfillmentOrderDocument, ShipmentDocument } from '../model';
import { readWithOrder, refuse, runAct } from './act';
import { viewShipment } from './actions';
import { announceShipped } from './announce';
import { cutShipment } from './cut';
import { reportProgress, settleOrder, startFulfilment } from './progress';

/** What staff sends to ship. */
export interface ShipInput {
    /** What ships, per product; absent means everything that remains. */
    lines?: ProductQuantity[] | undefined;
    /** The carrier's handle. Optional: a tracked method may get its code later, from the shipment. */
    trackingCode?: string | undefined;
}

/** What a committed ship leaves for the steps that follow it. */
interface Shipped {
    shipment: ShipmentDocument;
    order: OrderDocument;
    remainingUnits: number;
}

/**
 * Whether the order is in a state a shipment may leave from: `processing`, or `paid` for a caller
 * who may start it. A `cancelled` or `pending` order is not shippable at all — a different refusal,
 * because the remedy differs (nothing to do, versus start fulfilment).
 * @param status - the order's status
 * @param mayStart - whether the caller holds `start:Shipment`
 * @throws {ActRefusal} 409 for a closed or unpaid order, 403 for a `paid` one the caller may not start
 */
const gateOrder = (status: OrderStatus, mayStart: boolean): void => {
    if (status === OrderStatus.cancelled || status === OrderStatus.pending)
        refuse(409, ERROR_CODES.DELIVERY_NOT_SHIPPABLE, 'delivery.not-shippable');
    refuseUnearnedStart(status, mayStart);
    if (!isOpenForShipment(status, mayStart))
        refuse(409, ERROR_CODES.ORDER_NOT_PROCESSING, 'delivery.not-processing');
};

/**
 * The fulfillment order is one a shipment may be cut from, and what it may carry.
 * @param fulfillmentOrder - the fulfillment order, as the act's snapshot read it
 * @param requested - the lines asked for, or `undefined` for everything remaining
 */
const gateFulfillmentOrder = (
    fulfillmentOrder: FulfillmentOrderDocument,
    requested: ProductQuantity[] | undefined
): ProductQuantity[] => {
    if (fulfillmentOrder.kind !== 'physical')
        refuse(409, ERROR_CODES.DELIVERY_NOT_PHYSICAL, 'delivery.not-physical');
    if (!isShippable(fulfillmentOrder))
        refuse(409, ERROR_CODES.DELIVERY_NOT_SHIPPABLE, 'delivery.not-shippable');

    const verdict = checkShipLines(fulfillmentOrder.lines, requested);
    if (!verdict.ok)
        return refuse(422, ERROR_CODES.DELIVERY_LINES_INVALID, 'delivery.lines-invalid');
    return verdict.lines;
};

/**
 * The act itself, in its transaction. Refusals are decided first, from the snapshot the writes land
 * in; then the shipment is cut, `orders` is told, and the event is written.
 * @param fulfillmentOrderId - the fulfillment order to ship from
 * @param input - what staff sent
 * @param context - the caller
 * @param session - the act's transaction
 */
const shipAct = async (
    fulfillmentOrderId: string,
    input: ShipInput,
    context: CallerContext,
    mayStart: boolean,
    session: ClientSession
): Promise<Shipped> => {
    const { fulfillmentOrder, order } = await readWithOrder(fulfillmentOrderId, session);
    const orderId = String(fulfillmentOrder.orderId);
    gateOrder(order.status, mayStart);
    const lines = gateFulfillmentOrder(fulfillmentOrder, input.lines);

    const { shipment } = await cutShipment(
        {
            fulfillmentOrder,
            lines,
            trackingCode: input.trackingCode,
            forced: false,
            delivered: false,
            at: new Date(),
            takeStock: true
        },
        session
    );
    // The first shipment from `paid` makes the `start` move itself, in this transaction.
    const actor = context.caller.id;
    await startFulfilment(order, session, actor);

    const progress = await reportProgress(orderId, session);
    await settleOrder(
        orderId,
        progress.order.status,
        progress.summary,
        shipment.shippedAt,
        session,
        actor
    );
    await announceShipped(shipment, session, actor, progress.summary.remaining);

    return { shipment, order, remainingUnits: progress.summary.remaining };
};

/**
 * What follows a committed shipment: the shelf's stock cache and the audit row. The buyer's mail
 * rides `shipment.shipped`.
 * @param shipped - what the act left
 * @param context - the caller
 */
const afterShipped = (shipped: Shipped, context: CallerContext): Promise<void> =>
    orderService.refreshShelf(shipped.shipment.lines.map(({ productId }) => productId)).then(() => {
        recordAudit(context, {
            action: deliveryAuditActions.ADMIN_ORDER_SHIPPED,
            outcome: 'success',
            targetType: 'order',
            targetId: String(shipped.shipment.orderId),
            metadata: { shipmentId: String(shipped.shipment._id) }
        });
    });

/**
 * Ship some or all of a fulfillment order's remainder.
 *
 * @param fulfillmentOrderId - the fulfillment order to ship from
 * @param input - the lines and the tracking code
 * @param authContext - the caller, for the response's own `actions`
 * @param context - the caller, for the audit entry
 * @returns the shipment as it left, or the refusal naming which case it was
 */
export const shipFulfillmentOrder = (
    fulfillmentOrderId: string,
    input: ShipInput,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<Shipment> | ResponseReject> => {
    // Decided before the transaction opens: a retried transaction must not change the verdict.
    const mayStart = mayStartFulfilment(context);

    return runAct((session) => shipAct(fulfillmentOrderId, input, context, mayStart, session)).then(
        (result) => {
            if (result.refused) {
                auditUnearnedStart(context, result.reject, fulfillmentOrderId);
                return result.reject;
            }
            return afterShipped(result.value, context).then(() =>
                generateSuccess(
                    viewShipment(result.value.shipment, result.value.order, authContext),
                    201
                )
            );
        }
    );
};
