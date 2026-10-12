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
import { OrderStatus } from '@types';
import type { Shipment } from '@types';
import { ensureFulfillmentOrders, shipFulfillmentOrder, deliverShipment } from '../services';
import { fulfillmentOrderRepository, shipmentRepository } from '../repository';
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
    ensureFulfillmentOrders(orderId).then(() => fulfillmentOrderRepository.findByOrderId(orderId));

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
        const result = await shipFulfillmentOrder(
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
        const result = await deliverShipment(
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

/**
 * A shipment of the order's first fulfillment order, written straight to the collection — no
 * rank rule, no stock, no status move. For a test that needs a shipment to AIM at (a rank check, a
 * route table) rather than one that happened.
 *
 * @param orderId - the order, `paid` or `processing` so it has fulfillment orders
 */
export const createShipmentFor = async (orderId: string): Promise<ShipmentDocument> => {
    const [fulfillmentOrder] = await fulfillmentOrdersOf(orderId);
    return shipmentRepository.create({
        orderId: fulfillmentOrder.orderId,
        fulfillmentOrderId: fulfillmentOrder._id,
        number: 1,
        status: 'shipped',
        lines: fulfillmentOrder.lines.map(({ productId, title, quantity }) => ({
            productId,
            title,
            quantity
        })),
        forced: false,
        shippedAt: new Date()
    });
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
        kind: 'preorder' as const
    }));
    for (const { productId, quantity } of lines)
        await inventoryService.setPreorderLimit(productId, quantity);
    await inventoryService.reserveForOrder(orderId, lines);
    await inventoryService.commitForOrder(orderId);
    return { user, orderId, productIds: lines.map(({ productId }) => productId) };
};
