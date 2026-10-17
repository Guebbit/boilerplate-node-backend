/**
 * @module
 * Staff cutting a shipment from a fulfillment order — the shipping door. Everything it changes
 * commits in ONE transaction: the fulfillment order's lines, the shipment, the units leaving the
 * shelf, the order's summary and (when this shipment leaves nothing behind) its status, and
 * `shipment.shipped`. The mail and the audit row follow the commit.
 *
 * `forced` widens WHICH orders may ship (from `paid`, skipping `start`) — it never widens what gets
 * written, and it never ships from `on_hold`.
 *
 * See: docs/modules/delivery.md#shipping
 */

import type { ClientSession } from 'mongoose';
import { t } from '@infrastructure/i18n';
import {
    fieldError,
    generateSuccess,
    generateReject,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { orderService } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { OrderStatus } from '@types';
import type { AuthContext, CallerContext, Shipment } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { checkShipLines, findShippingMethod, isShippable } from '../domain';
import type { ProductQuantity } from '../domain';
import { deliveryAuditActions } from '../audit';
import { fulfillmentOrderRepository } from '../repository';
import type { FulfillmentOrderDocument, ShipmentDocument } from '../model';
import { ActRefusal, refuse, refuseMissing, runAct } from './act';
import { viewShipment } from './actions';
import { announceShipped } from './announce';
import { cutShipment } from './cut';
import { refuseUnearnedForce } from './force';
import { reportProgress, settleOrder } from './progress';

/** What staff sends to ship. */
export interface ShipInput {
    /** What ships, per product; absent means everything that remains. */
    lines?: ProductQuantity[] | undefined;
    /** The carrier's handle; required when the order's shipping method is tracked. */
    trackingCode?: string | undefined;
    /** Skip the `start` step: ship from `paid`. Needs `override:Order` and a `reason`. */
    forced?: boolean | undefined;
    /** Why the normal door did not apply; recorded on the order's override history. */
    reason?: string | undefined;
}

/** What a committed ship leaves for the steps that follow it. */
interface Shipped {
    shipment: ShipmentDocument;
    order: OrderDocument;
    remainingUnits: number;
}

/**
 * Whether the order is in a state a shipment may leave from: `processing`, or `paid` when forced.
 * A `cancelled` or `pending` order is not shippable at all — a different refusal, because the
 * remedy differs (nothing to do, versus start fulfilment).
 * @param status - the order's status
 * @param forced - whether the caller forces the first shipment
 */
const gateOrder = (status: OrderStatus, forced: boolean): void => {
    if (status === OrderStatus.cancelled || status === OrderStatus.pending)
        refuse(409, ERROR_CODES.DELIVERY_NOT_SHIPPABLE, 'delivery.not-shippable');
    const open = status === OrderStatus.processing || (forced && status === OrderStatus.paid);
    if (!open) refuse(409, ERROR_CODES.ORDER_NOT_PROCESSING, 'delivery.not-processing');
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
 * A tracked method needs a tracking code on every shipment. The method is looked up live, not
 * frozen at checkout, so a rate change also changes what the door requires.
 * @param order - the order
 * @param trackingCode - what staff sent
 * @throws {ActRefusal} a 422 naming `trackingCode` when a tracked method has none
 */
const gateTracking = (order: OrderDocument, trackingCode: string | undefined): void => {
    const method = order.shippingMethod ? findShippingMethod(order.shippingMethod) : undefined;
    if (method?.tracked && !trackingCode)
        throw new ActRefusal(
            generateReject(422, [
                fieldError(
                    'trackingCode',
                    t('delivery.tracking-code-required'),
                    ERROR_CODES.DELIVERY_TRACKING_CODE_REQUIRED
                )
            ])
        );
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
    session: ClientSession
): Promise<Shipped> => {
    const forced = input.forced === true;
    const fulfillmentOrder = await fulfillmentOrderRepository.findInSession(
        fulfillmentOrderId,
        session
    );
    if (!fulfillmentOrder) return refuseMissing('delivery.fulfillment-order-not-found');
    const orderId = String(fulfillmentOrder.orderId);

    const order = await orderService.readOrder(orderId, session);
    if (!order) return refuseMissing('delivery.order-not-found');
    gateOrder(order.status, forced);
    const lines = gateFulfillmentOrder(fulfillmentOrder, input.lines);
    gateTracking(order, input.trackingCode);

    const { shipment } = await cutShipment(
        {
            fulfillmentOrder,
            lines,
            trackingCode: input.trackingCode,
            forced,
            delivered: false,
            at: new Date(),
            takeStock: true
        },
        session
    );
    // A forced first shipment from `paid` makes the `start` move itself, as it always has.
    const actor = context.caller.id;
    if (
        order.status === OrderStatus.paid &&
        !(await orderService.markProcessing(orderId, session, actor))
    )
        refuse(409, ERROR_CODES.ORDER_NOT_PAID, 'delivery.not-paid');

    const progress = await reportProgress(orderId, session);
    await settleOrder(
        orderId,
        progress.order.status,
        progress.summary,
        shipment.shippedAt,
        session,
        actor
    );
    if (forced)
        await orderService.recordForcedFulfilment(
            orderId,
            {
                reason: input.reason ?? '',
                actorUserId: context.caller.id ?? '',
                at: shipment.shippedAt,
                from: order.status
            },
            session
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
            metadata: {
                shipmentId: String(shipped.shipment._id),
                forced: shipped.shipment.forced
            }
        });
    });

/**
 * Ship some or all of a fulfillment order's remainder.
 *
 * @param fulfillmentOrderId - the fulfillment order to ship from
 * @param input - the lines, tracking code and the `forced` flag with its reason
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
    const unearned = refuseUnearnedForce(context, input.forced, input.reason);
    if (unearned) return Promise.resolve(unearned);

    return fulfillmentOrderRepository.findById(fulfillmentOrderId).then((found) => {
        if (!found) return generateReject(404, [t('delivery.fulfillment-order-not-found')]);

        return orderService.getById(String(found.orderId)).then((order) => {
            if (!order) return generateReject(404, [t('delivery.order-not-found')]);

            return runAct((session) => shipAct(fulfillmentOrderId, input, context, session)).then(
                (result) => {
                    if (result.refused) return result.reject;
                    return afterShipped(result.value, context).then(() =>
                        generateSuccess(
                            viewShipment(result.value.shipment, result.value.order, authContext),
                            201
                        )
                    );
                }
            );
        });
    });
};
