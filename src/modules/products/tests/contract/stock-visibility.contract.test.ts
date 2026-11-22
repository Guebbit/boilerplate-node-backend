/**
 * @module
 * The product answer carries no stock, for anyone: not the counters (`onHand`, `reserved`,
 * `available`), not the shopper's flags (`inStock`, `lowStock`, `buyable`, `preorder`,
 * `backorder`). Stock is `inventory`'s own read (`/products/{id}/availability` for a shopper,
 * `/inventory/levels/{id}` for a stock reader), so the answer is the same for every role apart
 * from what a role is allowed to see at all: the `actions` it holds and the `translations` a
 * translator reads. Asserted on the detail and the list, for a guest, a customer, a role with the
 * product keys but no stock key (the editor), and each role that holds the stock key. The writes
 * that answer a product are in `tests/contract/product-write.test.ts`, which already stands up the
 * locales they need.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

/** Every stock-shaped field the product answer used to carry. */
const STOCK_FIELDS = [
    'onHand',
    'reserved',
    'available',
    'inStock',
    'lowStock',
    'buyable',
    'preorder',
    'backorder'
];

/** The data object of a response. */
const dataOf = (response: { body: unknown }) => response.body as Record<string, unknown>;

/** What differs by role on purpose: the caller's own `actions`, and the translator's `translations` and `source`. */
const withoutRoleViews = ({
    actions: _actions,
    translations: _translations,
    source: _source,
    ...rest
}: Record<string, unknown>) => rest;

/** The roles a read is tried as; `undefined` is a guest. */
const ROLES = [
    ['a guest', undefined],
    ['a customer', 'customer'],
    ['an unverified account', 'unverified'],
    ['an editor, who holds every product key but not the stock one', 'editor'],
    ['a manager', 'manager'],
    ['a warehouse worker', 'warehouse'],
    ['an admin', 'admin']
] as const;

/**
 * Reads `path` as `role` (a guest when absent).
 *
 * @param path - the product route
 * @param role - the role to authenticate as, if any
 */
const readAs = async (path: string, role: string | undefined) => {
    const request = api().get(path);
    if (role === undefined) return request;
    const { bearer } = await authenticateAsRole(role);
    return request.set('Authorization', bearer);
};

describe('GET /products/{id} — no stock in the answer', () => {
    it.each(ROLES)('carries none for %s', async (_who, role) => {
        const product = await createProduct({ onHand: 40 });

        const response = await readAs(`/products/${product.id}`, role);

        expect(response.status).toBe(200);
        expect(STOCK_FIELDS.filter((field) => field in dataOf(response))).toEqual([]);
    });

    it('answers a stock reader the same as a guest, apart from the caller’s own actions', async () => {
        const product = await createProduct({ onHand: 40 });

        const guest = await readAs(`/products/${product.id}`, undefined);
        const manager = await readAs(`/products/${product.id}`, 'manager');

        expect(withoutRoleViews(dataOf(manager))).toEqual(withoutRoleViews(dataOf(guest)));
    });
});

describe('GET /products — the list follows the same rule', () => {
    it.each(ROLES)('carries no stock in any row for %s', async (_who, role) => {
        await createProduct({ onHand: 12 });
        await createProduct({ onHand: 0 });

        const response = await readAs('/products', role);

        expect(response.status).toBe(200);
        const rows = response.body.items as Record<string, unknown>[];
        expect(rows).toHaveLength(2);
        expect(rows.flatMap((row) => STOCK_FIELDS.filter((field) => field in row))).toEqual([]);
    });
});
