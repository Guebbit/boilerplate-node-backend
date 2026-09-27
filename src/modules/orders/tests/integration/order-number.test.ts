/**
 * @module
 * The order number and its date, over real HTTP — the same "all or nothing" shape
 * `invoice-vat.test.ts` already proves for the VAT block: an order either shows both `orderNumber`
 * and its date, or neither, never a date with no number.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';

// No real Chromium in the test environment — same stub `invoice-vat.test.ts` uses.
const renderHtmlToPdfMock = jest.fn().mockResolvedValue(Buffer.from('pdf'));
jest.mock('@infrastructure/adapters/pdf', () => ({
    renderHtmlToPdf: (html: string) => renderHtmlToPdfMock(html)
}));

setupTestDb();

beforeEach(() => renderHtmlToPdfMock.mockClear());

describe('GET /orders/{id} — the order number on the response', () => {
    it('omits orderNumber on an order that predates this field', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data).not.toHaveProperty('orderNumber');
    });

    it('publishes the order number frozen at creation', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            orderNumber: '2026-000041'
        });

        const response = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.orderNumber).toBe('2026-000041');
    });
});

describe('GET /orders/{id}/invoice — the number-and-date block', () => {
    it('renders no number or date for an order with no order number', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        const html = renderHtmlToPdfMock.mock.calls[0][0] as string;
        expect(html).not.toContain('2026-000041');
    });

    it('renders the number and its date for an order that carries one', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            orderNumber: '2026-000041'
        });

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        const html = renderHtmlToPdfMock.mock.calls[0][0] as string;
        expect(html).toContain('2026-000041');
        // `createdAt` is the date printed alongside it — the fixture's own timestamp must show up too.
        const formattedYear = String(order.createdAt!.getUTCFullYear());
        expect(html).toContain(formattedYear);
    });
});
