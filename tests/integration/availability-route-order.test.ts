/**
 * `GET /products/availability` must be answered by inventory, not by products' `/:id`.
 *
 * Risk:    two modules mount routers at `/products`, and which one sees a request first is the
 *          registry's order (`src/modules.ts`: inventory before products). If that order ever
 *          flips, products' `/:id` reads the word `availability` as an id and answers 404, and the
 *          storefront silently loses every stock signal.
 * Asserts: the batch read answers 200 with `items` for an id it was asked, which only inventory's
 *          router does; and the registry lists inventory ahead of products.
 * Real:    the whole app, so the order tested is the order mounted.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { enabledModules } from '../../src/modules';

setupTestDb();

describe('GET /products/availability', () => {
    it('is answered by inventory, not read as GET /products/:id with the id "availability"', async () => {
        const product = await createProduct({ onHand: 2 });

        const response = await api().get(`/products/availability?id=${String(product._id)}`);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(1);
    });

    it('is declared by a module the registry lists ahead of products', () => {
        const names = enabledModules.map(({ name }) => name);

        expect(names.indexOf('inventory')).toBeGreaterThanOrEqual(0);
        expect(names.indexOf('inventory')).toBeLessThan(names.indexOf('products'));
    });
});
