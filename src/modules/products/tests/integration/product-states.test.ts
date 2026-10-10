/**
 * @module
 * The two visibility flags, over HTTP: `active` hides a product from shoppers, `purchasable` only
 * takes it off sale. A stranger sees the second kind in every listing and by id, and the first
 * kind nowhere; staff see both.
 *
 * See: docs/modules/products.md#product-states
 */

import { api, authenticateAsRole } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

/** The titles a catalogue search answers, however the response wraps them. */
const titlesOf = (body: unknown): string[] =>
    (body as { data: { items: { title: string }[] } }).data.items.map(({ title }) => title);

/** One product per state a shopper can meet, titled by what it is. */
const seedStates = () =>
    Promise.all([
        createProduct({ title: 'On sale product' }),
        createProduct({ title: 'Off sale product', purchasable: false }),
        createProduct({ title: 'Hidden product', active: false }),
        createProduct({ title: 'Hidden and off sale', active: false, purchasable: false })
    ]);

describe('GET /products, anonymously', () => {
    it('lists an off-sale product and hides an inactive one', async () => {
        await seedStates();

        const response = await api().get('/products');

        expect(titlesOf(response.body).toSorted()).toEqual(['Off sale product', 'On sale product']);
    });

    it('filters by ?purchasable=false to the off-sale products only', async () => {
        await seedStates();

        const response = await api().get('/products?purchasable=false');

        expect(titlesOf(response.body)).toEqual(['Off sale product']);
    });

    it('filters by ?purchasable=true to the products on sale only', async () => {
        await seedStates();

        const response = await api().get('/products?purchasable=true');

        expect(titlesOf(response.body)).toEqual(['On sale product']);
    });

    it('still hides an inactive product when ?purchasable asks for it', async () => {
        await seedStates();

        const response = await api().get('/products?purchasable=false&active=false');

        expect(titlesOf(response.body)).toEqual([]);
    });
});

describe('GET /products/:id', () => {
    it('shows an off-sale product publicly, flagged', async () => {
        const [, offSale] = await seedStates();

        const response = await api().get(`/products/${String(offSale._id)}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ purchasable: false, active: true });
    });

    it('answers 404 for an inactive product, whatever its purchasable flag', async () => {
        const states = await seedStates();
        const [hidden, hiddenOffSale] = states.slice(2);

        const first = await api().get(`/products/${String(hidden._id)}`);
        const second = await api().get(`/products/${String(hiddenOffSale._id)}`);

        expect([first.status, second.status]).toEqual([404, 404]);
    });

    it('shows an inactive product to staff holding products.any.read', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const states = await seedStates();
        const hidden = states[2];

        const response = await api()
            .get(`/products/${String(hidden._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.active).toBe(false);
    });
});
