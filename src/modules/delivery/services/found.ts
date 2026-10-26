/**
 * @module
 * A lost parcel turning up. `deliver` accepts a `lost` shipment exactly when every unit on it is
 * still open ({@link planRestoration}); the restore is all or nothing, in the arrival's own
 * transaction. This file also answers the read-side question the same rule decides — may this lost
 * shipment still be recorded as arrived? — so a `ShipmentActions.deliver` flag cannot disagree
 * with the act.
 *
 * See: docs/modules/delivery.md#lost-in-transit
 */

import type { ClientSession } from 'mongoose';
import { orderService } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { FulfillmentCancelReason, FulfillmentOrderStatus, ShipmentStatus } from '@types';
import type { AuthContext, Shipment } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { planRestoration, statusOfLines, withRemainderCancelled, withRestoration } from '../domain';
import type { LostShipmentFacts, Restoration } from '../domain';
import { fulfillmentOrderRepository, shipmentRepository } from '../repository';
import type { FulfillmentOrderDocument, ShipmentDocument } from '../model';
import { refuse } from './act';
import { viewShipment } from './actions';
import { announceCancelled } from './announce';

/**
 * A lost shipment and the fulfillment orders of its order, as the plan reads them.
 * @param shipment - the shipment
 * @param orders - every fulfillment order of its order
 */
const planFor = (
    shipment: ShipmentDocument,
    orders: readonly FulfillmentOrderDocument[]
): { facts: LostShipmentFacts; restoration: Restoration | undefined } => {
    const facts = {
        id: String(shipment._id),
        fulfillmentOrderId: String(shipment.fulfillmentOrderId),
        lines: shipment.lines.map(({ productId, title, quantity }) => ({
            productId,
            title,
            quantity
        }))
    };
    return {
        facts,
        restoration: planRestoration(
            facts,
            orders.map((one) => ({
                id: String(one._id),
                sourceShipmentId: one.sourceShipmentId ? String(one.sourceShipmentId) : undefined,
                lines: one.lines
            }))
        )
    };
};

/**
 * Whether a shipment is `lost` AND can still be recorded as arrived, for the flags on its read.
 * @param shipments - the shipments of one order
 * @param orderId - the order
 * @returns the ids of the lost shipments whose units are all still open
 */
export const restorableIds = (
    shipments: readonly ShipmentDocument[],
    orderId: string
): Promise<Set<string>> => {
    const lost = shipments.filter(({ status }) => status === ShipmentStatus.lost);
    if (lost.length === 0) return Promise.resolve(new Set());
    return fulfillmentOrderRepository
        .findByOrderId(orderId)
        .then(
            (orders) =>
                new Set(
                    lost
                        .filter((one) => planFor(one, orders).restoration !== undefined)
                        .map((one) => String(one._id))
                )
        );
};

/**
 * A shipment as the wire carries it, for an act or a read that holds one shipment: a `lost` one
 * asks the fulfillment orders whether it can still arrive.
 * @param shipment - the shipment
 * @param order - its order
 * @param authContext - the caller
 */
export const viewShipmentOf = (
    shipment: ShipmentDocument,
    order: OrderDocument,
    authContext: AuthContext | undefined
): Promise<Shipment> =>
    restorableIds([shipment], String(shipment.orderId)).then((ids) =>
        viewShipment(shipment, order, authContext, ids.has(String(shipment._id)))
    );

/**
 * The refusal every way a lost parcel can fail to be restorable shares.
 * @throws {ActRefusal} 409 `DELIVERY_LOST_SUPERSEDED`
 */
const refuseSuperseded = (): never =>
    refuse(409, ERROR_CODES.DELIVERY_LOST_SUPERSEDED, 'delivery.lost-superseded');

/**
 * Close the fulfillment orders made for the owed units: the parcel is here, so nothing is owed.
 * Cancelled with reason `found` and no refund.
 * @param ids - the owed fulfillment orders
 * @param orders - every fulfillment order of the order, as the act read them
 * @param session - the act's transaction
 */
const closeOwed = async (
    ids: readonly string[],
    orders: readonly FulfillmentOrderDocument[],
    session: ClientSession
): Promise<void> => {
    for (const owed of orders.filter(({ _id }) => ids.includes(String(_id)))) {
        const lines = withRemainderCancelled(owed.lines);
        const closed = await fulfillmentOrderRepository.claim(
            String(owed._id),
            owed.revision,
            {
                lines,
                status: statusOfLines(lines, false),
                cancelReason: FulfillmentCancelReason.found,
                unset: ['holdReason', 'holdNote', 'holdMessage']
            },
            session
        );
        if (!closed) return refuseSuperseded();
        await announceCancelled(closed, session);
    }
};

/**
 * Record a lost parcel as arrived: its units go back as shipped on the origin fulfillment order,
 * the owed fulfillment orders close with no refund, and the top-up of the stock hold is given back.
 *
 * @param shipment - the `lost` shipment, as the act read it
 * @param at - the arrival instant
 * @param session - the act's transaction
 * @returns the shipment, now `delivered`
 * @throws {ActRefusal} 409 `DELIVERY_LOST_SUPERSEDED` when any unit on it was shipped again or cancelled
 */
export const restoreLostShipment = async (
    shipment: ShipmentDocument,
    at: Date,
    session: ClientSession
): Promise<ShipmentDocument> => {
    const orderId = String(shipment.orderId);
    const orders = await fulfillmentOrderRepository.findByOrderId(orderId, session);
    const { facts, restoration } = planFor(shipment, orders);
    if (!restoration) return refuseSuperseded();

    const found = await shipmentRepository.markFound(String(shipment._id), at, session);
    if (!found) return refuseSuperseded();

    const origin = orders.find(({ _id }) => String(_id) === facts.fulfillmentOrderId);
    if (!origin) return refuseSuperseded();
    const lines = withRestoration(origin.lines, facts, restoration);
    const restored = await fulfillmentOrderRepository.claim(
        String(origin._id),
        origin.revision,
        {
            lines,
            status: statusOfLines(lines, origin.status === FulfillmentOrderStatus.on_hold)
        },
        session
    );
    if (!restored) return refuseSuperseded();
    await closeOwed(restoration.owedFulfillmentOrderIds, orders, session);

    // Give the top-up back: the shelf part as stock, the owed part as the claim on the restock.
    await orderService.releaseTopUp(
        orderId,
        facts.lines.flatMap(({ productId, quantity }) => {
            const owed = restoration.owed.find((one) => one.productId === productId)?.quantity ?? 0;
            return [
                ...(quantity > owed ? [{ productId, quantity: quantity - owed }] : []),
                ...(owed > 0 ? [{ productId, quantity: owed, kind: 'backorder' as const }] : [])
            ];
        }),
        session
    );
    return found;
};
