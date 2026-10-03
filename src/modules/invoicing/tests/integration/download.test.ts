/**
 * @module
 * `GET /orders/{id}/invoice` and `/credit-notes` over real HTTP: 404 for
 * an order that has not been invoiced yet, 200 once it has, and the same ownership scope every
 * other order read already enforces.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { markPaid } from '@modules/orders';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';

/** A second, distinctly-addressed customer — `authenticateAs('user')` always mints the same
 * default address, which collides the second time one test needs two customers. */
const authenticateAnotherUser = async () => {
    const user = await createUser(
        { email: 'stranger@example.com', verifiedAt: new Date() },
        'customer'
    );
    const response = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    return { user, bearer: `Bearer ${String(response.body.data.token)}` };
};

// No real Chromium in the test environment — same stub `orders`' own contract suite used before
// this route moved here. Captures nothing; this suite only asserts on status and headers.
jest.mock('@infrastructure/adapters/pdf', () => ({
    renderHtmlToPdf: jest.fn().mockResolvedValue(Buffer.from('pdf'))
}));

setupTestDb();

/** Waits out the fire-and-forget `ORDER_STATUS_CHANGED` listener that freezes the invoice. */
const waitUntilInvoiced = async (orderId: string, bearer: string, timeoutMs = 2000) => {
    const startedAt = Date.now();
    for (;;) {
        const response = await api().get(`/orders/${orderId}/invoice`).set('Authorization', bearer);
        if (response.status === 200) return;
        if (Date.now() - startedAt > timeoutMs)
            throw new Error('waitUntilInvoiced: timed out — still 404');
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

describe('GET /orders/{id}/invoice', () => {
    it('refuses a never-paid order with 404 ORDER_INVOICE_NOT_ISSUED', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response.body.errors[0].code).toBe('ORDER_INVOICE_NOT_ISSUED');
    });

    it('answers the invoice PDF once the order has been paid', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        await markPaid(String(order._id));
        await waitUntilInvoiced(String(order._id), bearer);

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('application/pdf');
        expect(response.headers['cache-control']).toBe('private, no-store');
    });

    it("a scoped caller cannot download another customer's invoice — absence, not refusal", async () => {
        const owner = await authenticateAs('user');
        const stranger = await authenticateAnotherUser();
        const product = await createProduct();
        const order = await createOrder(owner.user, [toOrderItem(product, 1)]);
        await markPaid(String(order._id));
        await waitUntilInvoiced(String(order._id), owner.bearer);

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', stranger.bearer);

        expect(response.status).toBe(404);
    });

    it("an admin CAN download another customer's invoice", async () => {
        const owner = await authenticateAs('user');
        const admin = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(owner.user, [toOrderItem(product, 1)]);
        await markPaid(String(order._id));
        await waitUntilInvoiced(String(order._id), owner.bearer);

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', admin.bearer);

        expect(response.status).toBe(200);
    });

    it('answers 404 for an unusable id, not a 422', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/orders/not-an-id/invoice').set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});

describe('GET /orders/{id} — the actions.invoice flag', () => {
    it('is false before payment and true once the order is paid', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const before = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);
        expect(before.body.data.actions.invoice).toBe(false);

        await markPaid(String(order._id));

        const after = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);
        expect(after.body.data.actions.invoice).toBe(true);
    });
});

describe('GET /orders/{id}/credit-notes', () => {
    it('lists nothing for an order never refunded', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/orders/${String(order._id)}/credit-notes`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual([]);
    });

    it("refuses someone else's order with 404", async () => {
        const { user } = await authenticateAs('user');
        const { bearer: strangerBearer } = await authenticateAnotherUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/orders/${String(order._id)}/credit-notes`)
            .set('Authorization', strangerBearer);

        expect(response.status).toBe(404);
    });
});

describe('GET /orders/{id}/credit-notes/{creditNoteId}', () => {
    it('refuses a credit note the order does not have with 404 ORDER_CREDIT_NOTE_NOT_ISSUED', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/orders/${String(order._id)}/credit-notes/${'a'.repeat(24)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response.body.errors[0].code).toBe('ORDER_CREDIT_NOTE_NOT_ISSUED');
    });
});
