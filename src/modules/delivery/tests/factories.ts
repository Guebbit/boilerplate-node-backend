/**
 * @module
 * Delivery test factories — shipping and delivering an order through the module's own doors, so a
 * test that needs "a shipped order" gets the fulfillment orders, the shipments, the summary and the
 * status move a real one has. Writes past nothing: each helper is the staff action, repeated.
 */

import { asAdmin, callerContextAs } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import type { UserDocument } from '@modules/users';
import { createProduct } from '@modules/products/tests/factories';
import { inventoryService } from '@modules/inventory';
import { createOrder, forceOrderStatus, toOrderItem } from '@modules/orders/tests/factories';
import { owedLineOf } from '@modules/orders';
import { OrderStatus } from '@types';
import type { Shipment } from '@types';
import { deliveryService } from '../services';
import { fulfillmentOrderRepository, shipmentRepository } from '../repository';
import { fulfillmentOrderModel } from '../model';
import type { FulfillmentOrderDocument, ShipmentDocument } from '../model';

/** What a test may pass to {@link shipEverything}. */
export interface ShipEverythingOptions {
    /** Tracking code for every shipment; a tracked method needs one. */
    trackingCode?: string;
    /** Ship from `paid` without `start`, as an override holder. */
    forced?: boolean;
    reason?: string;
}

/**
 * The order's fulfillment orders, made first if it has none — what `GET /delivery/order/:id` does.
 * @param orderId - the order
 */
export const fulfillmentOrdersOf = (orderId: string): Promise<FulfillmentOrderDocument[]> =>
    deliveryService
        .ensureFulfillmentOrders(orderId)
        .then(() => fulfillmentOrderRepository.findByOrderId(orderId));

/**
 * Set a fulfillment order's dates and consent to a state a test needs to start from — a promise
 * long past, a date the buyer already accepted, a deadline that has just gone — which only the
 * clock reaches through the doors.
 * @param fulfillmentOrderId - the fulfillment order
 * @param fields - the fields to set
 */
export const setFulfillmentOrderState = (
    fulfillmentOrderId: string,
    fields: Partial<
        Pick<
            FulfillmentOrderDocument,
            | 'agreedAt'
            | 'expectedAt'
            | 'consent'
            | 'consentDeadline'
            | 'revisedShipDate'
            | 'lastNoticeAt'
            | 'slips'
        >
    >
): Promise<unknown> =>
    fulfillmentOrderModel.updateOne({ _id: fulfillmentOrderId }, { $set: fields }).exec();

/**
 * The order's shipments, in the order they were cut.
 * @param orderId - the order
 */
export const shipmentsOf = (orderId: string): Promise<ShipmentDocument[]> =>
    shipmentRepository.findByOrderId(orderId);

/**
 * Ship every physical fulfillment order of the order in full, one shipment each, as an admin.
 *
 * @param orderId - the order, already `processing`
 * @param options - tracking code, or the forced flag with its reason
 * @returns the shipments, as the door answered them
 */
export const shipEverything = async (
    orderId: string,
    options: ShipEverythingOptions = {}
): Promise<Shipment[]> => {
    const shipped: Shipment[] = [];
    const all = await fulfillmentOrdersOf(orderId);
    for (const fulfillmentOrder of all) {
        if (fulfillmentOrder.kind !== 'physical' || fulfillmentOrder.status !== 'open') continue;
        const result = await deliveryService.shipFulfillmentOrder(
            String(fulfillmentOrder._id),
            options,
            asAdmin(),
            callerContextAs('admin')
        );
        if (!result.success) throw new Error(JSON.stringify(result.errors));
        shipped.push(result.data);
    }
    return shipped;
};

/**
 * Deliver every shipment still out, as an admin.
 * @param orderId - the order
 */
export const deliverEverything = async (orderId: string): Promise<Shipment[]> => {
    const delivered: Shipment[] = [];
    const all = await shipmentsOf(orderId);
    for (const shipment of all) {
        if (shipment.status !== 'shipped') continue;
        const result = await deliveryService.deliverShipment(
            String(shipment._id),
            {},
            asAdmin(),
            callerContextAs('admin')
        );
        if (!result.success) throw new Error(JSON.stringify(result.errors));
        delivered.push(result.data);
    }
    return delivered;
};

/**
 * Take an order through the real doors to `shipped`, or on to `delivered`: put it in `processing`,
 * make its fulfillment orders, ship everything and (for `delivered`) deliver everything — so the
 * records, the summary, the status and the shelf all agree, as they do for an order that really got
 * there. For a test that needs goods that left or arrived and is about something else.
 *
 * @param orderId - the order, in any status before `shipped`
 * @param to - where to carry it
 */
export const carryOrderTo = async (orderId: string, to: 'shipped' | 'delivered'): Promise<void> => {
    await forceOrderStatus(orderId, OrderStatus.processing);
    await shipEverything(orderId, { trackingCode: 'TRK-CARRIED01' });
    if (to === 'delivered') await deliverEverything(orderId);
};

/** One preorder line to place: how many units, promised for which date. */
export interface WantedPreorder {
    quantity: number;
    releaseDate: Date;
}

/**
 * A PAID order of preorder lines, held in the ledger and committed as a payment would: one product
 * per `wanted`, each with an allowance big enough for everything asked, and no stock on the shelf.
 * Nothing is shipped and no fulfillment order exists until something reads them (`fulfillmentOrdersOf`).
 *
 * @param wanted - the lines, one product each
 * @param buyer - the buyer's address (a new account is made; distinct per order in a test that makes
 *   two), or an account that already exists, such as the one a test is logged in as
 */
export const paidPreorderOrder = async (
    wanted: readonly WantedPreorder[],
    buyer: string | UserDocument = 'buyer@example.com'
) => {
    const user = typeof buyer === 'string' ? await createUser({ email: buyer }) : buyer;
    const products = await Promise.all(
        wanted.map(({ releaseDate }) =>
            createProduct({ onHand: 0, price: 10, releaseDate: releaseDate.toISOString() })
        )
    );
    const order = await createOrder(
        user,
        products.map((product, index) => toOrderItem(product, wanted[index].quantity)),
        { status: OrderStatus.paid }
    );
    const orderId = String(order._id);
    const lines = products.map((product, index) => ({
        productId: String(product._id),
        quantity: wanted[index].quantity,
        kind: 'backorder' as const
    }));
    for (const { productId, quantity } of lines)
        await inventoryService.setBackorderLimit(productId, quantity);
    await inventoryService.reserveForOrder(orderId, lines);
    await inventoryService.commitForOrder(orderId);
    return { user, orderId, productIds: lines.map(({ productId }) => productId) };
};

/** One backordered line to place: how many units, how many of them the shelf holds, and the promise. */
export interface WantedBackorder {
    quantity: number;
    /** Units on the shelf; the rest are owed. */
    shelf: number;
    /** The product's restock date; absent means the 30-day default. */
    restockDate?: Date;
}

/**
 * A PAID order of one released product open to backorder, held in the ledger as a checkout would:
 * the shelf units there are are taken, the rest claimed against an uncapped limit, the owed part
 * frozen on the line with its promise. No fulfillment order exists until something reads them.
 *
 * @param wanted - the line
 * @param buyer - the buyer's address (a new account is made), or an account that already exists
 */
export const paidBackorderOrder = async (
    wanted: WantedBackorder,
    buyer: string | UserDocument = 'buyer@example.com'
) => {
    const user = typeof buyer === 'string' ? await createUser({ email: buyer }) : buyer;
    const product = await createProduct({
        onHand: wanted.shelf,
        price: 10,
        allowBackorder: true,
        ...(wanted.restockDate ? { restockDate: wanted.restockDate.toISOString() } : {})
    });
    const productId = String(product._id);
    await inventoryService.setBackorderLimit(productId, null);
    const owed = Math.max(0, wanted.quantity - wanted.shelf);
    const owedLine = owedLineOf(owed, wanted.restockDate, new Date());
    const order = await createOrder(
        user,
        [
            {
                ...toOrderItem(product, wanted.quantity),
                ...(owedLine ? { ...owedLine, promisedAt: owedLine.promisedAt.toISOString() } : {})
            }
        ],
        { status: OrderStatus.paid }
    );
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId, quantity: wanted.quantity, spill: true }
    ]);
    await inventoryService.commitForOrder(orderId);
    return { user, orderId, productId };
};
