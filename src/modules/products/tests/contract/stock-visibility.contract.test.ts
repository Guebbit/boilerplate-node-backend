/**
 * @module
 * Who sees how much stock. Everyone gets `inStock` and `lowStock`; the exact counters (`onHand`,
 * `reserved`, `available`) go only to a caller holding `inventory.any.read`, because exact numbers
 * leak sales velocity and help plan a denial of inventory. Asserted on the reads, for a guest, a
 * customer, a role with the product keys but no stock key (the editor), and each role that does
 * hold it. The writes that answer a product are in `tests/contract/product-write.test.ts`, which
 * already stands up the locales they need.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAsRole } from '@tests/http';
import { setEnvironment } from '@tests/environment';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

/** The three counters only a stock reader sees. */
const COUNTERS = ['onHand', 'reserved', 'available'];

/** The two flags every caller sees. */
const FLAGS = ['inStock', 'lowStock'];

/** The rows of a list response. */
const rows = (response: { body: { data: { items: Record<string, unknown>[] } } }) =>
    response.body.data.items;

/** The data object of a response. */
const dataOf = (response: { body: { data: unknown } }) =>
    response.body.data as Record<string, unknown>;

describe('GET /products/{id} — the counters follow inventory.any.read', () => {
    it.each([
        ['a guest', undefined],
        ['a customer', 'customer'],
        ['an unverified account', 'unverified'],
        ['an editor, who holds every product key but not the stock one', 'editor']
    ])('hides the counters from %s, and still says whether it is in stock', async (_who, role) => {
        const product = await createProduct({ onHand: 40 });
        const caller = role ? await authenticateAsRole(role) : undefined;
        const bearer = caller?.bearer;

        const request = api().get(`/products/${product.id}`);
        const response = await (bearer ? request.set('Authorization', bearer) : request);

        expect(response.status).toBe(200);
        const data = dataOf(response);
        expect(COUNTERS.filter((field) => field in data)).toEqual([]);
        expect(FLAGS.map((field) => data[field])).toEqual([true, false]);
    });

    it.each(['manager', 'warehouse', 'admin'])('shows the counters to a %s', async (role) => {
        const product = await createProduct({ onHand: 40 });
        const { bearer } = await authenticateAsRole(role);

        const response = await api().get(`/products/${product.id}`).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(dataOf(response)).toMatchObject({
            onHand: 40,
            reserved: 0,
            available: 40,
            inStock: true,
            lowStock: false
        });
    });
});

describe('inStock and lowStock', () => {
    it('reads an empty shelf as out of stock, not as low', async () => {
        const product = await createProduct({ onHand: 0 });

        const response = await api().get(`/products/${product.id}`);

        expect(FLAGS.map((field) => dataOf(response)[field])).toEqual([false, false]);
    });

    it('reads what is left as low at the threshold and not above it', async () => {
        setEnvironment({ NODE_LOW_STOCK_THRESHOLD: '5' });
        const atThreshold = await createProduct({ onHand: 5 });
        const above = await createProduct({ onHand: 6 });

        const [low, plenty] = await Promise.all([
            api().get(`/products/${atThreshold.id}`),
            api().get(`/products/${above.id}`)
        ]);

        expect([dataOf(low).lowStock, dataOf(plenty).lowStock]).toEqual([true, false]);
    });

    it('follows the configured threshold, shared with the stock board', async () => {
        setEnvironment({ NODE_LOW_STOCK_THRESHOLD: '2' });
        const product = await createProduct({ onHand: 4 });

        const response = await api().get(`/products/${product.id}`);

        expect(dataOf(response).lowStock).toBe(false);
    });
});

describe('GET /products — the list follows the same rule', () => {
    it('strips the counters from every row a guest reads, and keeps them for a stock reader', async () => {
        await createProduct({ onHand: 12 });
        await createProduct({ onHand: 3 });

        const guest = await api().get('/products');
        const { bearer } = await authenticateAsRole('manager');
        const manager = await api().get('/products').set('Authorization', bearer);

        expect(rows(guest)).toHaveLength(2);
        expect(rows(guest).flatMap((row) => COUNTERS.filter((field) => field in row))).toEqual([]);
        expect(
            rows(manager)
                .map((row) => row.onHand)
                .toSorted()
        ).toEqual([12, 3].toSorted());
    });

    // The guest's response is shared through the cache: warming it with a stock reader's answer
    // first must never put the counters in front of the next guest.
    it('keeps a stock reader’s answer out of the guest’s cached one', async () => {
        await createProduct({ onHand: 12 });
        const { bearer } = await authenticateAsRole('admin');

        await api().get('/products').set('Authorization', bearer);
        const guest = await api().get('/products');

        expect(
            (guest.body.data.items as Record<string, unknown>[]).flatMap((row) =>
                COUNTERS.filter((field) => field in row)
            )
        ).toEqual([]);
    });
});
