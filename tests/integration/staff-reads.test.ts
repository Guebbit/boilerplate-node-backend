/**
 * @module
 * Staff opening someone else's record leaves `admin.<resource>.viewed`; a customer reading their
 * own, a staff member reading their own, and a list do not. Detail routes only, over real HTTP.
 */

import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { auditLogger } from '@infrastructure/adapters/logger';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { OrderStatus } from '@types';

setupTestDb();

/** One audit entry as the logger receives it. */
interface Entry {
    action: string;
    actor_user_id?: string;
    target_type?: string;
    target_id?: string;
}

let auditSpy: jest.SpyInstance;

beforeEach(() => {
    auditSpy = jest.spyOn(auditLogger, 'log').mockImplementation(() => auditLogger);
});

afterEach(() => {
    auditSpy.mockRestore();
});

/** The `*.viewed` entries recorded so far. */
const viewed = (): Entry[] =>
    auditSpy.mock.calls
        .map((call: unknown[]) => call[2] as Entry)
        .filter((entry) => /^admin\.\w+\.viewed$/.test(entry.action));

/** A customer with one shipped order, and an admin to read it with. */
const shopWithOrder = async () => {
    const customer = await authenticateAs('user');
    const admin = await authenticateAs('admin');
    const product = await createProduct({ price: 20 });
    const order = await createOrder(customer.user, [toOrderItem(product, 1)], {
        status: OrderStatus.shipped
    });
    return { customer, admin, orderId: String(order._id) };
};

describe('GET /users/{id}', () => {
    it("records an admin opening another account's detail", async () => {
        const customer = await authenticateAs('user');
        const admin = await authenticateAs('admin');
        auditSpy.mockClear();

        const response = await api()
            .get(`/users/${String(customer.user._id)}`)
            .set('Authorization', admin.bearer);

        expect(response.status).toBe(200);
        expect(viewed()).toEqual([
            expect.objectContaining({
                action: 'admin.user.viewed',
                actor_user_id: String(admin.user._id),
                target_type: 'user',
                target_id: String(customer.user._id)
            })
        ]);
    });

    it('does not record an admin opening their own account', async () => {
        const admin = await authenticateAs('admin');
        auditSpy.mockClear();

        await api()
            .get(`/users/${String(admin.user._id)}`)
            .set('Authorization', admin.bearer);

        expect(viewed()).toEqual([]);
    });

    it('does not record the list', async () => {
        const admin = await authenticateAs('admin');
        auditSpy.mockClear();

        await api().get('/users').set('Authorization', admin.bearer);

        expect(viewed()).toEqual([]);
    });
});

describe('GET /orders/{id}', () => {
    it("records staff opening a customer's order", async () => {
        const { admin, orderId } = await shopWithOrder();
        auditSpy.mockClear();

        const response = await api().get(`/orders/${orderId}`).set('Authorization', admin.bearer);

        expect(response.status).toBe(200);
        expect(viewed()).toEqual([
            expect.objectContaining({
                action: 'admin.order.viewed',
                target_type: 'order',
                target_id: orderId
            })
        ]);
    });

    it('does not record the customer reading their own order', async () => {
        const { customer, orderId } = await shopWithOrder();
        auditSpy.mockClear();

        const response = await api()
            .get(`/orders/${orderId}`)
            .set('Authorization', customer.bearer);

        expect(response.status).toBe(200);
        expect(viewed()).toEqual([]);
    });

    it('does not record the orders list', async () => {
        const { admin } = await shopWithOrder();
        auditSpy.mockClear();

        await api().get('/orders').set('Authorization', admin.bearer);

        expect(viewed()).toEqual([]);
    });
});

describe('GET /returns/{id}', () => {
    it('records staff opening a return, and not the customer who opened it', async () => {
        const { customer, admin, orderId } = await shopWithOrder();
        const opened = await api()
            .post('/returns')
            .set('Authorization', customer.bearer)
            .send({ orderId, reason: 'withdrawal' });
        const returnId = String(opened.body.data.id);
        auditSpy.mockClear();

        await api().get(`/returns/${returnId}`).set('Authorization', customer.bearer);
        expect(viewed()).toEqual([]);

        await api().get(`/returns/${returnId}`).set('Authorization', admin.bearer);
        expect(viewed()).toEqual([
            expect.objectContaining({ action: 'admin.return.viewed', target_id: returnId })
        ]);
    });
});
