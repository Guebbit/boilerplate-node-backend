/**
 * @module
 * An order's addresses and notes are encrypted at rest and decrypted on every read path: the
 * route, search and the account export. The raw collection must hold no plaintext, and a value
 * moved to another order must not decrypt.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { orderService, findOwnOrders } from '../../services';
import { orderModel } from '../../model';

setupTestDb();

const SHIPPING = {
    fullName: 'Ada Lovelace',
    street: '12 Analytical Engine Rd',
    city: 'London',
    zip: 'SW1A',
    country: 'GB',
    phone: '+44 20 0000 0000'
};
const BILLING = {
    fullName: 'Ada Lovelace',
    street: '1 Accounts Office Way',
    city: 'London',
    zip: 'SW1A',
    country: 'GB'
};
const NOTES = 'Leave with the concierge, 2nd floor';

/** One order with every encrypted field set. */
const seedPiiOrder = async (user: Parameters<typeof createOrder>[0], email?: string) => {
    const product = await createProduct();
    return createOrder(user, [toOrderItem(product, 1)], {
        shippingAddress: SHIPPING,
        billingAddress: BILLING,
        notes: NOTES,
        ...(email ? { email } : {})
    });
};

describe('order PII at rest', () => {
    it('stores no plaintext in the raw collection', async () => {
        const { user } = await authenticateAs('user');
        const order = await seedPiiOrder(user);

        const raw = JSON.stringify(await orderModel.collection.findOne({ _id: order._id }));

        for (const plain of ['Ada Lovelace', 'Analytical Engine', 'London', '+44 20', 'concierge'])
            expect(raw).not.toContain(plain);
    });

    it('round-trips through GET /orders/{id}', async () => {
        const { bearer, user } = await authenticateAs('user');
        const order = await seedPiiOrder(user);

        const response = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.shippingAddress).toMatchObject(SHIPPING);
        expect(response.body.data.billingAddress).toMatchObject({ street: BILLING.street });
        expect(response.body.data.notes).toBe(NOTES);
    });

    it('decrypts in search results and the account export', async () => {
        const { user } = await authenticateAs('user');
        await seedPiiOrder(user);

        const found = await orderService.search({}, orderService.ownerScope(String(user._id)));
        const exported = await findOwnOrders(String(user._id));

        expect(found.items[0]?.shippingAddress).toMatchObject(SHIPPING);
        expect(found.items[0]?.notes).toBe(NOTES);
        expect(exported[0]?.billingAddress?.street).toBe(BILLING.street);
    });

    it('still filters and sorts on the plaintext email', async () => {
        const { user } = await authenticateAs('user');
        await seedPiiOrder(user, 'zed@example.com');
        await seedPiiOrder(user, 'amy@example.com');

        const filtered = await orderService.search({ email: 'amy@example.com' });
        const sorted = await orderService.search({ sort: ['email'] });

        expect(filtered.items.map((item) => item.email)).toEqual(['amy@example.com']);
        expect(sorted.items.map((item) => item.email)).toEqual([
            'amy@example.com',
            'zed@example.com'
        ]);
    });

    it("refuses an order's notes copied onto another order: the order id is in the AAD", async () => {
        const { user } = await authenticateAs('user');
        const first = await seedPiiOrder(user);
        const second = await seedPiiOrder(user);
        const firstRow = await orderModel.collection.findOne({ _id: first._id });
        const stolen = firstRow?.notes as string;

        await orderModel.collection.updateOne({ _id: second._id }, { $set: { notes: stolen } });

        expect(() => second.toJSON()).not.toThrow();
        const reloaded = await orderModel.findById(second._id).exec();
        expect(() => reloaded?.toJSON()).toThrow();
    });
});
