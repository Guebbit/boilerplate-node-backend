/**
 * @module
 * `GET /shop-tasks/summary` over the real app: each count is the total of the list its screen
 * shows, a caller sees only the keys whose screen they may open, an order that leaves the work
 * leaves the count, and zero is sent as zero.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, forceOrderStatus, toOrderItem } from '@modules/orders/tests/factories';
import { forceStockLevel } from '@modules/inventory/tests/factories';
import { insertBareReturns } from '@modules/returns/tests/factories';
import {
    fulfillmentOrdersOf,
    paidPreorderOrder,
    setFulfillmentOrderState
} from '@modules/delivery/tests/factories';
import { refundOrderPayment } from '@modules/payments/tests/factories';
import { paymentService } from '@modules/payments';
import { asAdmin, callerContextAs } from '@tests/callers';
import { resetDomainEvents } from '@kernel/events';
import { OrderStatus } from '@types';

setupTestDb();

afterEach(() => resetDomainEvents());

/** The summary as the caller reads it. */
const summaryFor = (bearer: string) =>
    api().get('/shop-tasks/summary').set('Authorization', bearer);

/** The total a list answers for a query, as the screen shows it. */
const listTotal = (bearer: string, url: string) =>
    api()
        .get(url)
        .set('Authorization', bearer)
        .then((response) => response.body.meta.totalItems as number);

/** A buyer of their own, so two orders in one test never share an address. */
let buyers = 0;

/** An order in the given status, for a new buyer. */
const orderIn = async (status: OrderStatus, extras: Record<string, unknown> = {}) => {
    buyers += 1;
    const user = await createUser({
        email: `buyer${String(buyers)}@example.com`,
        username: `buyer${String(buyers)}`
    });
    const product = await createProduct();
    return createOrder(user, [toOrderItem(product, 1)], { status, ...extras });
};

describe('GET /shop-tasks/summary', () => {
    it('counts exactly what each screen lists, for an administrator', async () => {
        const { bearer } = await authenticateAs('admin');
        await orderIn(OrderStatus.paid);
        await orderIn(OrderStatus.processing);
        await orderIn(OrderStatus.pending);
        await orderIn(OrderStatus.paid, { deletedAt: new Date() });
        await insertBareReturns([{ status: 'requested', reason: 'damaged', daysAgo: 1 }]);
        const lowOne = await createProduct();
        await forceStockLevel(lowOne._id, 0, 0);

        const response = await summaryFor(bearer);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            salesOrders:
                (await listTotal(bearer, '/orders?status=paid&deleted=false&pageSize=1')) +
                (await listTotal(bearer, '/orders?status=processing&deleted=false&pageSize=1')),
            salesPayments: 0,
            returns: await listTotal(bearer, '/returns?status=requested&pageSize=1'),
            salesPreorders: await listTotal(
                bearer,
                '/delivery/fulfillment-orders?late=true&pageSize=1'
            ),
            inventory: await listTotal(bearer, '/inventory/levels?lowOnly=true&pageSize=1')
        });
        // The seeded rows are really in it, not an empty agreement.
        expect(response.body.salesOrders).toBe(2);
        expect(response.body.inventory).toBeGreaterThan(0);
    });

    it('counts one payment needing attention and one late preorder, each as one', async () => {
        const { bearer } = await authenticateAs('admin');
        // A cash payment with a hand-paid refund still owed: the payments list's "attention" row.
        const refunded = await orderIn(OrderStatus.pending);
        await paymentService.recordOfflinePayment(
            String(refunded._id),
            { method: 'cash' },
            callerContextAs('admin')
        );
        await refundOrderPayment(String(refunded._id), asAdmin(), callerContextAs('admin'), {
            amount: '1.00'
        });
        // A paid preorder whose promised date is already behind it, with units still to come.
        const preorder = await paidPreorderOrder(
            [{ quantity: 1, releaseDate: new Date(Date.now() + 86_400_000) }],
            'late-buyer@example.com'
        );
        const [fulfillmentOrder] = await fulfillmentOrdersOf(preorder.orderId);
        await setFulfillmentOrderState(String(fulfillmentOrder._id), {
            expectedAt: new Date(Date.now() - 86_400_000)
        });

        const response = await summaryFor(bearer);

        expect(response.body.salesPayments).toBe(1);
        expect(response.body.salesPreorders).toBe(1);
    });

    it('sends zero as zero, never leaves a key out for an administrator', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await summaryFor(bearer);

        expect(response.body).toEqual({
            salesOrders: 0,
            salesPayments: 0,
            returns: 0,
            salesPreorders: 0,
            inventory: 0
        });
    });

    it('drops an order from the count when it ships', async () => {
        const { bearer } = await authenticateAs('admin');
        const waiting = await orderIn(OrderStatus.paid);
        await orderIn(OrderStatus.paid);

        await forceOrderStatus(String(waiting._id), OrderStatus.shipped);

        const response = await summaryFor(bearer);
        expect(response.body.salesOrders).toBe(1);
    });

    it('sends a caller only the screens their rules open', async () => {
        const { bearer } = await authenticateAsRole('warehouse');

        const response = await summaryFor(bearer);

        expect(Object.keys(response.body).toSorted()).toEqual(
            ['inventory', 'returns', 'salesOrders', 'salesPreorders'].toSorted()
        );
    });

    it('answers 401 without a session', async () => {
        const response = await api().get('/shop-tasks/summary');

        expect(response.status).toBe(401);
    });
});
