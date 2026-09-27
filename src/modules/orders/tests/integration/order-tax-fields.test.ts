/**
 * @module
 * `GET /orders/{id}` — the VAT fields on the response: every order carries a full VAT breakdown, on
 * every line and at the order level. The invoice document's own VAT table is `invoicing`'s own —
 * see `src/modules/invoicing/tests/unit/emails.test.ts`.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder } from '@modules/orders/tests/factories';

setupTestDb();

/** A line frozen with a real VAT rate — what `freezeOrderLines` produces at real checkout time. */
const taxedLine = (productId: string, price: number, taxRate: number) => ({
    product: { id: productId, title: 'Taxed Product', price, taxRate },
    quantity: 2
});

describe('GET /orders/{id} — the VAT fields on the response', () => {
    it('publishes netTotal/taxTotal and every line tax field', async () => {
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
