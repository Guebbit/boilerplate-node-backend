/**
 * @module
 * Cutting one shipment from a fulfillment order, inside the act's transaction — the write every
 * way of shipping shares: staff shipping, the digital fulfilment, and the shipments an admin status
 * override brings in step. The fulfillment order is claimed by its revision, so two acts racing the
 * same remainder cannot both land.
 */

import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { orderService } from '@modules/orders';
import { ERROR_CODES } from '@api/error-codes';
import { FulfillmentOrderKind } from '@types';
import { statusOfLines, withShipped, type ProductQuantity } from '../domain';
import { fulfillmentOrderRepository, shipmentRepository } from '../repository';
import type { FulfillmentOrderDocument, ShipmentDocument } from '../model';
import { encryptDestination } from '../pii';
import { refuse } from './act';

/** What one shipment is made from. */
export interface CutInput {
    /** The fulfillment order, as the act's snapshot read it. */
    fulfillmentOrder: FulfillmentOrderDocument;
    /** What the shipment carries — already checked against what remains. */
    lines: readonly ProductQuantity[];
    /** The carrier's handle, when the method carries one. */
    trackingCode?: string | undefined;
    /** Staff skipped a step, or an override recorded it. */
    forced: boolean;
    /** Born `delivered` — the digital act — rather than `shipped`. */
    delivered: boolean;
    /** When it happened: `shippedAt`, and `deliveredAt` for a delivered one. */
    at: Date;
    /** Take the units off the shelf. `false` when something else already did (an override). */
    takeStock: boolean;
}

/** What {@link cutShipment} made. */
export interface Cut {
    shipment: ShipmentDocument;
    fulfillmentOrder: FulfillmentOrderDocument;
}

/**
 * The order's shipping address, encrypted for a shipment about to be written under `shipmentId`;
 * `undefined` for a digital fulfilment and for an order that ships nowhere.
 * @param before - the fulfillment order the shipment leaves from
 * @param shipmentId - the shipment's pre-allocated `_id`
 * @param session - the act's transaction
 */
const destinationFor = (
    before: FulfillmentOrderDocument,
    shipmentId: Types.ObjectId,
    session: ClientSession
): Promise<ShipmentDocument['destination']> =>
    before.kind === FulfillmentOrderKind.physical
        ? orderService.readOrder(String(before.orderId), session).then((order) => {
              const address = order ? orderService.shippingAddressOf(order) : undefined;
              return address ? encryptDestination(address, shipmentId) : undefined;
          })
        : Promise.resolve(undefined);

/**
 * Cut the shipment: claim the fulfillment order with the shipped lines added, write the shipment,
 * and — unless told otherwise — take its units off the shelf.
 *
 * @param input - what the shipment is made from
 * @param session - the act's transaction
 * @throws {ActRefusal} when the fulfillment order moved since the act read it
 */
export const cutShipment = (input: CutInput, session: ClientSession): Promise<Cut> => {
    const { fulfillmentOrder: before, lines, delivered, at } = input;
    const orderId = String(before.orderId);
    const shippedLines = withShipped(before.lines, lines);

    return fulfillmentOrderRepository
        .claim(
            String(before._id),
            before.revision,
            {
                lines: shippedLines,
                status: statusOfLines(shippedLines, false),
                // Shipping ends a hold: an override ships what staff held back.
                unset: ['holdReason', 'holdNote']
            },
            session
        )
        .then((claimed) => {
            if (!claimed)
                return refuse(409, ERROR_CODES.DELIVERY_NOT_SHIPPABLE, 'delivery.not-shippable');
            // Allocated first: the destination's ciphertext is bound to the shipment's own id.
            const shipmentId = new Types.ObjectId();
            // One read after the other: a transaction's session does not take parallel operations.
            return destinationFor(before, shipmentId, session).then((destination) =>
                shipmentRepository.nextNumber(orderId, session).then((number) =>
                    shipmentRepository
                        .create(
                            {
                                _id: shipmentId,
                                ...(destination ? { destination } : {}),
                                orderId: before.orderId,
                                fulfillmentOrderId: before._id,
                                number,
                                kind: before.kind,
                                status: delivered ? 'delivered' : 'shipped',
                                lines: lines.map(({ productId, quantity }) => ({
                                    productId,
                                    quantity,
                                    title:
                                        before.lines.find((line) => line.productId === productId)
                                            ?.title ?? ''
                                })),
                                forced: input.forced,
                                shippedAt: at,
                                ...(input.trackingCode ? { trackingCode: input.trackingCode } : {}),
                                ...(delivered ? { deliveredAt: at } : {})
                            },
                            session
                        )
                        .then((shipment) =>
                            (input.takeStock
                                ? orderService.shipStock(orderId, lines, session)
                                : Promise.resolve(true)
                            ).then(() => ({ shipment, fulfillmentOrder: claimed }))
                        )
                )
            );
        });
};
