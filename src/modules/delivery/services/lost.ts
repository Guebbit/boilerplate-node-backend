/**
 * @module
 * Staff reporting a parcel lost or damaged in transit. The shipment becomes `lost`, its units are
 * open again on the SAME fulfillment order (shipped again through the ordinary door: no new order,
 * invoice or revenue), the stock hold is topped up, and the part the shelf cannot cover is owed:
 * a new fulfillment order on hold for stock. Everything commits in ONE transaction with the
 * order's summary, its step back to `processing` and `shipment.lost`.
 *
 * See: docs/modules/delivery.md#lost-in-transit
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
import { productService } from '@modules/products';
import { BACKORDER_PROMISE_DAYS } from '@modules/shop';
import {
    FulfillmentHoldReason,
    FulfillmentOrderKind,
    FulfillmentOrderStatus,
    ShipmentStatus
} from '@types';
import type { AuthContext, CallerContext, Shipment, ShipmentLostReason } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { canRecordArrival } from '@modules/orders';
import { owedDateOf, statusOfLines, withLoss } from '../domain';
import type { ProductQuantity } from '../domain';
import { deliveryAuditActions } from '../audit';
import { fulfillmentOrderRepository, shipmentRepository } from '../repository';
import type { FulfillmentOrderDocument, ShipmentDocument } from '../model';
import { refuse, refuseMissing, runAct } from './act';
import { announceLost } from './announce';
import { reportProgress } from './progress';
import { viewShipmentOf } from './found';

/** What staff sends to report a loss. */
export interface LostInput {
    /** Lost by the carrier, or damaged in transit before its arrival was recorded. */
    reason: ShipmentLostReason;
    /** Free text for colleagues; reaped, never mailed. */
    note?: string | undefined;
    /** A sentence for the buyer, mailed and shown on their order. */
    message?: string | undefined;
}

/** What a committed loss leaves for the steps that follow it. */
interface Lost {
    shipment: ShipmentDocument;
    order: OrderDocument;
}

/** What the stock hold came to for one lost line. */
interface Owed {
    productId: string;
    quantity: number;
}

/**
 * The product titles and restock dates the owed units are promised against.
 * @param owed - the owed units, per product
 * @param now - the instant of the loss
 */
const promiseFor = (owed: readonly Owed[], now: Date): Promise<{ at: Date; defaulted: boolean }> =>
    productService.findManyByIds(owed.map(({ productId }) => productId)).then((products) =>
        owedDateOf(
            owed.map(
                ({ productId }) =>
                    products.find((one) => String(one._id) === productId)?.restockDate
            ),
            now,
            BACKORDER_PROMISE_DAYS
        )
    );

/**
 * Make the fulfillment order that waits for the owed units: on hold for stock, `cause: backorder`,
 * promised for the restock date, and linked to the loss so the parcel turning up can close it.
 *
 * @param origin - the fulfillment order the lost shipment left from
 * @param shipment - the lost shipment
 * @param owed - the owed units, per product
 * @param promise - when they are expected
 * @param session - the act's transaction
 */
const createOwedFulfillmentOrder = async (
    origin: FulfillmentOrderDocument,
    shipment: ShipmentDocument,
    owed: readonly Owed[],
    promise: { at: Date; defaulted: boolean },
    session: ClientSession
): Promise<FulfillmentOrderDocument> => {
    const siblings = await fulfillmentOrderRepository.findByOrderId(
        String(origin.orderId),
        session
    );
    const lines = owed.map(({ productId, quantity }) => ({
        productId,
        title: shipment.lines.find((line) => line.productId === productId)?.title ?? '',
        quantity,
        shippedQuantity: 0,
        cancelledQuantity: 0
    }));
    return fulfillmentOrderRepository.create(
        {
            orderId: origin.orderId,
            number: Math.max(...siblings.map(({ number }) => number)) + 1,
            kind: FulfillmentOrderKind.physical,
            status: statusOfLines(lines, true),
            lines,
            holdReason: FulfillmentHoldReason.awaiting_stock,
            cause: 'backorder',
            ...(promise.defaulted ? { defaulted: true } : {}),
            agreedAt: promise.at,
            expectedAt: promise.at,
            sourceShipmentId: shipment._id,
            revision: 0
        },
        session
    );
};

/**
 * The refusal every way a parcel can fail to be reportable shares.
 * @throws {ActRefusal} 409 `DELIVERY_NOT_LOSABLE`
 */
const refuseNotLosable = (): never =>
    refuse(409, ERROR_CODES.DELIVERY_NOT_LOSABLE, 'delivery.not-losable');

/**
 * The act itself, in its transaction. Refusals first, from the snapshot the writes land in.
 * @param shipmentId - the shipment that did not arrive
 * @param input - the reason and what staff wrote
 * @param context - the caller
 * @param session - the act's transaction
 */
const lostAct = async (
    shipmentId: string,
    input: LostInput,
    context: CallerContext,
    session: ClientSession
): Promise<Lost> => {
    const found = await shipmentRepository.findInSession(shipmentId, session);
    if (!found) return refuseMissing('delivery.shipment-not-found');
    const orderId = String(found.orderId);
    const order = await orderService.readOrder(orderId, session);
    if (!order) return refuseMissing('delivery.order-not-found');
    if (
        found.status !== ShipmentStatus.shipped ||
        found.kind !== FulfillmentOrderKind.physical ||
        !canRecordArrival(order.status)
    )
        return refuseNotLosable();
    const origin = await fulfillmentOrderRepository.findInSession(
        String(found.fulfillmentOrderId),
        session
    );
    if (!origin) return refuseMissing('delivery.fulfillment-order-not-found');

    const now = new Date();
    const shipment = await shipmentRepository.markLost(
        shipmentId,
        {
            lostAt: now,
            lostReason: input.reason,
            lostNote: input.note,
            lostMessage: input.message
        },
        session
    );
    if (!shipment) return refuseNotLosable();

    const lines: ProductQuantity[] = shipment.lines.map(({ productId, quantity }) => ({
        productId,
        quantity
    }));
    const taken = await orderService.topUpStock(orderId, lines, session);
    const owed = taken
        .filter(({ owed: quantity }) => quantity > 0)
        .map(({ productId, owed: quantity }) => ({ productId, quantity }));

    const reopened = withLoss(origin.lines, lines, owed);
    const claimed = await fulfillmentOrderRepository.claim(
        String(origin._id),
        origin.revision,
        {
            lines: reopened,
            status: statusOfLines(reopened, origin.status === FulfillmentOrderStatus.on_hold)
        },
        session
    );
    if (!claimed) return refuse(409, ERROR_CODES.DELIVERY_NOT_LOSABLE, 'delivery.not-losable');

    const promise = owed.length > 0 ? await promiseFor(owed, now) : undefined;
    if (promise) await createOwedFulfillmentOrder(origin, shipment, owed, promise, session);

    // Units are open again, so a `shipped` order is being fulfilled once more.
    await reportProgress(orderId, session);
    if (order.status === 'shipped') {
        const moved = await orderService.markReopened(orderId, session, context.caller.id);
        if (!moved) return refuseNotLosable();
    }

    await announceLost(
        shipment,
        {
            userId: order.userId ? String(order.userId) : undefined,
            message: input.message,
            owed: owed.map(({ productId, quantity }) => ({
                title: shipment.lines.find((line) => line.productId === productId)?.title ?? '',
                quantity
            })),
            expectedAt: promise?.at
        },
        session,
        context.caller.id
    );
    return { shipment, order };
};

/**
 * Report a shipment lost or damaged in transit.
 *
 * @param shipmentId - the shipment that did not arrive
 * @param input - the reason, and optionally a note for colleagues and a message for the buyer
 * @param authContext - the caller, for the response's own `actions`
 * @param context - the caller, for the audit entry
 * @returns the shipment as it now stands, or the refusal naming which case it was
 */
export const markShipmentLost = (
    shipmentId: string,
    input: LostInput,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<Shipment> | ResponseReject> =>
    runAct((session) => lostAct(shipmentId, input, context, session)).then((result) => {
        if (result.refused) return result.reject;
        const { shipment } = result.value;
        recordAudit(context, {
            action: deliveryAuditActions.ADMIN_SHIPMENT_LOST,
            outcome: 'success',
            targetType: 'order',
            targetId: String(shipment.orderId),
            // The code only: the note is free text the operator log has no business holding.
            metadata: { shipmentId, reason: input.reason }
        });
        const productIds = shipment.lines.map(({ productId }) => productId);
        return orderService
            .refreshShelf(productIds)
            .then(() => orderService.getById(String(shipment.orderId)))
            .then((fresh) =>
                viewShipmentOf(shipment, fresh ?? result.value.order, authContext).then(
                    generateSuccess
                )
            );
    });
