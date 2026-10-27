/**
 * @module
 * `FulfillmentOrderActions.ship` says the ship door would accept; the door behind it says what it
 * accepts. For every role × order status, a ship is accepted exactly when `ship` is true. Shipping
 * from `paid` is in the sweep: it needs `start:Shipment` as well as `update:Shipment`.
 * Each case gets its own order, because the door writes.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { api, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, forceOrderStatus, toOrderItem } from '@modules/orders/tests/factories';
import { fulfillmentOrdersOf } from '@modules/delivery/tests/factories';
import { OrderStatus } from '@types';
import type { FulfillmentOrder } from '@types';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([]);
});

/** The roles swept: staff who differ in `update:Shipment` and `start:Shipment`. */
const ROLES = ['admin', 'manager', 'warehouse', 'support'] as const;

/** The statuses a shipment could be cut from, or refused at. */
const STATUSES = [
    OrderStatus.pending,
    OrderStatus.paid,
    OrderStatus.processing,
    OrderStatus.cancelled
] as const;

/** Whether a response is the door opening. */
const accepted = ({ status }: { status: number }): boolean => status >= 200 && status < 300;

describe('the ship action and the ship door agree', () => {
    it('for every role and every status', async () => {
        const owner = await authenticateAsRole('customer');
        const signedIn = await Promise.all(
            ROLES.map(async (role) => ({ role, staff: await authenticateAsRole(role) }))
        );
        const disagreements: string[] = [];
        let shippedFromPaid = 0;

        for (const status of STATUSES)
            for (const { role, staff } of signedIn) {
                const product = await createProduct({ title: `Shirt ${Math.random()}`, price: 30 });
                const order = await createOrder(owner.user, [toOrderItem(product, 1)], {
                    status: OrderStatus.paid
                });
                const orderId = String(order._id);
                // A paid order has the fulfillment orders its payment made; the status under test
                // is then forced onto it, so even `pending` and `cancelled` carry one.
                const [fulfillmentOrder] = await fulfillmentOrdersOf(orderId);
                if (status !== OrderStatus.paid) await forceOrderStatus(orderId, status);
                const view = await api()
                    .get(`/orders/${orderId}/fulfillment-orders`)
                    .set('Authorization', staff.bearer);
                const ship =
                    (view.body as { items?: FulfillmentOrder[] }).items?.[0]?.actions.ship ?? false;
                const opened = accepted(
                    await api()
                        .post(
                            `/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/shipments`
                        )
                        .set('Authorization', staff.bearer)
                        .send({})
                );

                if (opened && status === OrderStatus.paid) shippedFromPaid += 1;
                if (opened !== ship)
                    disagreements.push(
                        `${role} on ${status}: ship ${String(ship)}, door ${String(opened)}`
                    );
            }

        expect(disagreements).toEqual([]);
        // A sweep where nothing ever ships from `paid` would agree too: admin and warehouse must.
        expect(shippedFromPaid).toBe(2);
    });
});
