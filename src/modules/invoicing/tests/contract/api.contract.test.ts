/**
 * @module
 * Contract tests for the invoicing routes under /orders/{id}: the invoice PDF, the credit-note
 * list and one credit note's PDF. They make each declared branch reachable over HTTP and checked
 * against the spec; the ownership scope, the busy queue (503) and the number series are
 * `tests/integration/`'s business.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { orderService } from '@modules/orders';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { emptyFileSandbox } from '@tests/file-sandbox';
import { eventually } from '@tests/eventually';
import { MISSING_ID } from '@tests/ids';

// No real Chromium in the test environment: the render returns a stub PDF.
jest.mock('@infrastructure/adapters/pdf', () => ({
    renderHtmlToPdf: jest.fn().mockResolvedValue(Buffer.from('pdf'))
}));

setupTestDb();

// A downloaded invoice is stored on first render; sweep what the case left in the sandbox.
afterEach(emptyFileSandbox);

/** A signed-in customer with one order of their own, not yet paid. */
const customerWithOrder = async () => {
    const { bearer, user } = await authenticateAs('user');
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, 1)]);
    return { bearer, orderId: String(order._id) };
};

describe('GET /orders/{id}/invoice', () => {
    it('matches the error contract for an order that has not been invoiced', async () => {
        const { bearer, orderId } = await customerWithOrder();

        const response = await api().get(`/orders/${orderId}/invoice`).set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response.body.errors[0].code).toBe('ORDER_INVOICE_NOT_ISSUED');
    });

    it('matches the contract once the order is paid: a PDF', async () => {
        const { bearer, orderId } = await customerWithOrder();
        await orderService.markPaid(orderId);
        // The invoice is frozen by a fire-and-forget listener; wait for it.
        await eventually(() =>
            api()
                .get(`/orders/${orderId}/invoice`)
                .set('Authorization', bearer)
                .then((response) => response.status === 200)
        );

        const response = await api().get(`/orders/${orderId}/invoice`).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/^application\/pdf/);
    });

    it('refuses a caller who is not signed in', async () => {
        const response = await api().get(`/orders/${MISSING_ID}/invoice`);

        expect(response.status).toBe(401);
    });
});

describe('GET /orders/{id}/credit-notes', () => {
    it('matches the contract for an order never refunded: an empty list', async () => {
        const { bearer, orderId } = await customerWithOrder();

        const response = await api()
            .get(`/orders/${orderId}/credit-notes`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual([]);
    });

    it('refuses a caller who is not signed in', async () => {
        const response = await api().get(`/orders/${MISSING_ID}/credit-notes`);

        expect(response.status).toBe(401);
    });
});

describe('GET /orders/{id}/credit-notes/{creditNoteId}', () => {
    it('matches the error contract for a credit note that does not exist', async () => {
        const { bearer, orderId } = await customerWithOrder();

        const response = await api()
            .get(`/orders/${orderId}/credit-notes/${MISSING_ID}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('refuses a caller who is not signed in', async () => {
        const response = await api().get(`/orders/${MISSING_ID}/credit-notes/${MISSING_ID}`);

        expect(response.status).toBe(401);
    });
});
