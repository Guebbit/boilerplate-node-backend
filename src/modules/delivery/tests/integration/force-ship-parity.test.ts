/**
 * @module
 * `FulfillmentOrderActions.forceShip` says the forced door would open while the ordinary one is
 * closed; the door behind it says what it accepts. For every role × order status, a forced ship is
 * accepted exactly when `forceShip` is true (wherever `ship` is off), and `forceShip` is never true beside `ship`.
 * Each case gets its own order, because the door writes. A paid order with one fulfillment order
 * awaiting stock is part of the sweep: `override` drops `shipped` there, `forceShip` must not.
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

/** The roles swept: staff who differ in `update:Shipment` and `override:Order`. */
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

describe('forceShip and the forced ship door agree', () => {
    it('for every role and every status', async () => {
        const owner = await authenticateAsRole('customer');
        const signedIn = await Promise.all(
            ROLES.map(async (role) => ({ role, staff: await authenticateAsRole(role) }))
        );
        const disagreements: string[] = [];
        let forcedOnly = 0;

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
                    .get(`/delivery/order/${orderId}`)
                    .set('Authorization', staff.bearer);
                const shown = (view.body as { data?: { fulfillmentOrders?: FulfillmentOrder[] } })
                    .data?.fulfillmentOrders?.[0]?.actions;
                const ship = shown?.ship ?? false;
                const forceShip = shown?.forceShip ?? false;
                const opened = accepted(
                    await api()
                        .post(
                            `/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/shipments`
                        )
                        .set('Authorization', staff.bearer)
                        .send({ forced: true, reason: 'parity sweep' })
                );

                if (forceShip && !ship && opened) forcedOnly += 1;
                if (ship && forceShip)
                    disagreements.push(`${role} on ${status}: ship and forceShip`);
                // With the ordinary door open a forced request is still its own question (it needs
                // `override:Order`), so the door is compared only where `ship` is off.
                if (!ship && opened !== forceShip)
                    disagreements.push(
                        `${role} on ${status}: forceShip ${String(forceShip)}, door ${String(opened)}`
                    );
            }

        expect(disagreements).toEqual([]);
        // A sweep where nothing is ever forced would agree too: some cell must be forced-only.
        expect(forcedOnly).toBeGreaterThan(0);
    });
});
