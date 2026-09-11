/**
 * `scenarios/check.ts`'s guarantee assertion, driven against a real database. Products are seeded
 * through `createProduct` — the same test factory every product suite uses — rather than the full
 * `scenarios/products.ts` fixture set, which needs locales and translations wired up for a
 * concern this suite isn't about.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { findUnmetGuarantees, assertScenarioGuarantees } from '@scenarios/check';

setupTestDb();

describe("the shop scenario's guarantees", () => {
    it('reports every declared product guarantee missing from an empty catalogue', async () => {
        const problems = await findUnmetGuarantees('shop');

        expect(problems).toEqual([
            'products: product.softDeleted is declared but not seeded',
            'products: product.inactive is declared but not seeded',
            'products: product.outOfStock is declared but not seeded',
            'products: product.barebones is declared but not seeded'
        ]);
    });

    it('finds nothing to report once every guaranteed state is seeded', async () => {
        await Promise.all([
            createProduct({ deletedAt: '2024-01-01T00:00:00.000Z' }),
            createProduct({ active: false }),
            createProduct({ onHand: 0 }),
            // `description` left unset: the schema's own `''` default is what `product.barebones` looks for.
            createProduct({})
        ]);

        await expect(assertScenarioGuarantees('shop')).resolves.toBeUndefined();
    });

    it('throws naming every guarantee still missing', async () => {
        // Leaves `description` unset too, same as a real `barebones` row — one seeded product
        // can only ever demonstrate one of the mutually exclusive states below.
        await createProduct({ active: false });

        await expect(assertScenarioGuarantees('shop')).rejects.toThrow(
            /product\.softDeleted[\S\s]*product\.outOfStock/
        );
    });
});
