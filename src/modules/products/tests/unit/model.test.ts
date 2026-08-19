/**
 * Products must never leak `_id`/`__v`,
 * on any response path — a real document (`toJSON`) or a `.lean()` list result
 * (mapped manually via `applyProductTransform`, since `.lean()` bypasses `toJSON`).
 */
import { asStub } from '@tests/stub';
import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factory';
import * as productService from '@modules/products/service';

setupTestDb();

describe('product serialization', () => {
    it('normalizes a hydrated document via toJSON', async () => {
        const product = await createProduct({ title: 'A Real Product' });
        const json = product.toJSON() as Record<string, unknown>;

        expect(json.id).toBe(product._id.toString());
        expect(JSON.stringify(json)).not.toContain('_id');
        expect(JSON.stringify(json)).not.toContain('__v');
    });

    it('normalizes a single lookup via productService.getById (no .lean())', async () => {
        const product = await createProduct({ title: 'Lookup Product', active: true });
        const found = await productService.getById(product._id.toString(), true);

        expect(found!.toJSON()).toMatchObject({
            id: product._id.toString(),
            title: 'Lookup Product'
        });
    });

    it('normalizes a lean list via productService.search', async () => {
        await createProduct({ title: 'Listed Product', active: true });
        const { items } = await productService.search({}, true);

        expect(items).toHaveLength(1);
        const item = asStub<Record<string, unknown>>(items[0]);
        expect(item.id).toMatch(/^[\da-f]{24}$/);
        expect(item._id).toBeUndefined();
        expect(item.__v).toBeUndefined();
    });
});
