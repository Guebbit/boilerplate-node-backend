/**
 * @module
 * The part of a re-send that the shelf cannot cover: units the shop owes the buyer again (a lost
 * parcel, a replacement under the guarantee). They wait on a new fulfillment order on hold for
 * stock, promised for the restock date, outside the backorder cap.
 *
 * See: docs/modules/delivery.md#lost-in-transit
 */

import type { ClientSession } from 'mongoose';
import type { Types } from 'mongoose';
import { productService } from '@modules/products';
import { BACKORDER_PROMISE_DAYS } from '@modules/shop';
import { FulfillmentHoldReason, FulfillmentOrderKind } from '@types';
import { owedDateOf, statusOfLines } from '../domain';
import type { OwedDate } from '../domain';
import { fulfillmentOrderRepository } from '../repository';
import type { FulfillmentOrderDocument } from '../model';

/** What the stock hold came to for one re-sent line. */
export interface Owed {
    productId: string;
    quantity: number;
}

/** What the owed fulfillment order needs to know about where the units come from. */
export interface OwedOrigin {
    orderId: Types.ObjectId;
    /** The title a line carried when it first shipped. */
    titleOf: (productId: string) => string;
    /** The lost shipment whose owed units these are; absent for a replacement. */
    sourceShipmentId?: Types.ObjectId;
}

/**
 * The restock dates the owed units are promised against.
 * @param owed - the owed units, per product
 * @param now - the instant of the act
 */
export const promiseFor = (owed: readonly Owed[], now: Date): Promise<OwedDate> =>
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
 * promised for the restock date, and — for a lost parcel — linked to the loss so the parcel
 * turning up can close it.
 *
 * @param origin - where the owed units come from
 * @param owed - the owed units, per product
 * @param promise - when they are expected
 * @param session - the act's transaction
 */
export const createOwedFulfillmentOrder = async (
    origin: OwedOrigin,
    owed: readonly Owed[],
    promise: OwedDate,
    session: ClientSession
): Promise<FulfillmentOrderDocument> => {
    const siblings = await fulfillmentOrderRepository.findByOrderId(
        String(origin.orderId),
        session
    );
    const lines = owed.map(({ productId, quantity }) => ({
        productId,
        title: origin.titleOf(productId),
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
            promisedAt: promise.at,
            expectedAt: promise.at,
            ...(origin.sourceShipmentId ? { sourceShipmentId: origin.sourceShipmentId } : {}),
            revision: 0
        },
        session
    );
};
