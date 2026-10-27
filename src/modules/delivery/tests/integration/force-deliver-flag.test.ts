/**
 * @module
 * `ShipmentActions.forceDeliver` says a forced arrival would be accepted: the ordinary gate (a
 * staff caller, a shipment still `shipped`) plus `override:Order`. Read through the real route, for
 * each role, then again once the shipment has arrived.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { api, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { carryOrderTo, shipmentsOf } from '@modules/delivery/tests/factories';
import { OrderStatus } from '@types';
import type { ShipmentActions } from '@types';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([]);
});

/**
 * The first shipment's actions as a signed-in role reads them.
 * @param orderId - the order
 * @param bearer - the role's Authorization header
 */
const shipmentActionsFor = (
    orderId: string,
    bearer: string
): Promise<ShipmentActions | undefined> =>
    api()
        .get(`/orders/${orderId}/shipments`)
        .set('Authorization', bearer)
        .then(
            (response) =>
                (response.body as { items?: { actions: ShipmentActions }[] }).items?.[0]?.actions
        );

describe('ShipmentActions.update and forceDeliver', () => {
    it('follow the staff key, the override key and the shipment state', async () => {
        const owner = await authenticateAsRole('customer');
        const admin = await authenticateAsRole('admin');
        const warehouse = await authenticateAsRole('warehouse');
        const product = await createProduct({ title: 'Shirt', price: 30 });
        const order = await createOrder(owner.user, [toOrderItem(product, 1)], {
            status: OrderStatus.paid
        });
        const orderId = String(order._id);
        await carryOrderTo(orderId, 'shipped');

        // Warehouse updates shipments but holds no override key; admin holds both.
        expect(await shipmentActionsFor(orderId, admin.bearer)).toEqual({
            deliver: true,
            forceDeliver: true,
            update: true
        });
        expect(await shipmentActionsFor(orderId, warehouse.bearer)).toEqual({
            deliver: true,
            forceDeliver: false,
            update: true
        });
        expect(await shipmentActionsFor(orderId, owner.bearer)).toEqual({
            deliver: false,
            forceDeliver: false,
            update: false
        });

        const [shipment] = await shipmentsOf(orderId);
        await api()
            .post(`/delivery/shipments/${String(shipment._id)}/deliver`)
            .set('Authorization', admin.bearer)
            .send({})
            .expect(200);

        // Delivered: the arrival is closed, but the tracking code stays editable (dispute evidence).
        expect(await shipmentActionsFor(orderId, admin.bearer)).toEqual({
            deliver: false,
            forceDeliver: false,
            update: true
        });
    });
});
