/**
 * @module
 * The invoice route and the order response, over real HTTP, for the one distinction VAT_3
 * decided: an order either carries a full VAT breakdown on every line, or none at all — never a
 * partial one. `api.contract.test.ts` covers the invoice route's AUTHORIZATION scope; this covers
 * what it actually RENDERS and what `GET /orders/{id}` actually publishes.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';

// No real Chromium in the test environment — same stub `api.contract.test.ts` uses. Captures the
// HTML it was asked to print, so a case can assert on what actually reached the page.
const renderHtmlToPdfMock = jest.fn().mockResolvedValue(Buffer.from('pdf'));
jest.mock('@infrastructure/adapters/pdf', () => ({
    renderHtmlToPdf: (html: string) => renderHtmlToPdfMock(html)
}));

setupTestDb();

beforeEach(() => renderHtmlToPdfMock.mockClear());

/** A line frozen with a real VAT rate — what `freezeOrderLines` produces at real checkout time. */
const taxedLine = (productId: string, price: number, taxRate: number) => ({
    product: { id: productId, title: 'Taxed Product', price, taxRate },
    quantity: 2
});

describe('GET /orders/{id}/invoice — pre-VAT vs. VAT orders', () => {
    it('renders no VAT table or shop identity for an order frozen before VAT existed', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 2)]);

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        const html = renderHtmlToPdfMock.mock.calls[0][0] as string;
        expect(html).not.toContain('<table>');
    });

    it('renders the VAT table and totals for an order with a frozen rate on every line', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [taxedLine(String(product._id), 19.9, 0.22)]);

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        const html = renderHtmlToPdfMock.mock.calls[0][0] as string;
        expect(html).toContain('<table>');
        // 19.90 × 2 at 22%: gross 3980 cents, tax = round(3980 × 0.22/1.22) = 718 → 7.18.
        expect(html).toContain('7.18');
    });
});

describe('GET /orders/{id} — the VAT fields on the response', () => {
    it('omits netTotal/taxTotal and every line tax field on a pre-VAT order', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        expect(response.body.data).not.toHaveProperty('netTotal');
        expect(response.body.data).not.toHaveProperty('taxTotal');
        expect(response.body.data.items[0]).not.toHaveProperty('taxAmount');
        expect(response.body.data.items[0].product).not.toHaveProperty('taxRate');
    });

    it('publishes netTotal/taxTotal and every line tax field on a fully-VAT order', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [taxedLine(String(product._id), 19.9, 0.22)]);

        const response = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        expect(response.body.data.items[0].product.taxRate).toBe(0.22);
        expect(response.body.data.items[0].taxAmount).toBe(7.18);
        expect(response.body.data.items[0].netAmount).toBe(32.62);
        expect(response.body.data.netTotal).toBe(32.62);
        expect(response.body.data.taxTotal).toBe(7.18);
    });
});
