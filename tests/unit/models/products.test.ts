/**
 * Regression guard for PROPOSAL §1 (option A): products must never leak `_id`/`__v`,
 * on any response path — a real document (`toJSON`) or a `.lean()` list result
 * (mapped manually via `applyProductTransform`, since `.lean()` bypasses `toJSON`).
 */
import { Types } from 'mongoose';
import { setupTestDb } from '../../helpers/setup-test-db';
import { createProduct } from '../../helpers/factories/products';
import * as productService from '@services/products';

setupTestDb();

describe('product serialization', () => {
    it('normalizes a hydrated document via toJSON', async () => {
        const product = await createProduct({ title: 'A Real Product' });
        const json = product.toJSON() as Record<string, unknown>;

        expect(json.id).toBe((product._id as Types.ObjectId).toString());
        expect(JSON.stringify(json)).not.toContain('_id');
        expect(JSON.stringify(json)).not.toContain('__v');
    });

    it('normalizes a single lookup via productService.getById (no .lean())', async () => {
        const product = await createProduct({ title: 'Lookup Product', active: true });
        const found = await productService.getById(
            (product._id as Types.ObjectId).toString(),
            true
        );

        expect(found!.toJSON()).toMatchObject({
            id: (product._id as Types.ObjectId).toString(),
            title: 'Lookup Product'
        });
    });

    it('normalizes a lean list via productService.search', async () => {
        await createProduct({ title: 'Listed Product', active: true });
        const { items } = await productService.search({}, true);

        expect(items).toHaveLength(1);
        const item = items[0] as unknown as Record<string, unknown>;
        expect(item.id).toMatch(/^[\da-f]{24}$/);
        expect(item._id).toBeUndefined();
        expect(item.__v).toBeUndefined();
    });
});
