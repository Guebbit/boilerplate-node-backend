/**
 * @module
 * A product's `allowBackorder` and `restockDate`, over HTTP: the switch and the date are written
 * and read back, `backorder` is derived (never stored), the date is bounded to a year ahead, and a
 * passed date reads sold out.
 *
 * See: docs/modules/products.md#backorder
 */

import { api, authenticateAsRole } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { productModel } from '../../model';

setupTestDb();

/** A date `days` from now, as the ISO string a client sends. */
const inDays = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString();

/** A product with the switch on and room under a cap of five, as `inventory` syncs it. */
const backorderProduct = async (overrides: Parameters<typeof createProduct>[0] = {}) => {
    const product = await createProduct({ onHand: 0, allowBackorder: true, ...overrides });
    await productModel.updateOne(
        { _id: product._id },
        { $set: { backorderLimit: 5, backordered: 0 } }
    );
    return String(product._id);
};

describe('GET /products/:id', () => {
    it('flags a released product that allows backorder, with its restock date', async () => {
        const restockDate = inDays(20);
        const id = await backorderProduct({ restockDate });

        const response = await api().get(`/products/${id}`);

        expect(response.body.data).toMatchObject({
            backorder: true,
            inStock: false,
            preorder: false,
            allowBackorder: true,
            restockDate
        });
    });

    it('does not flag a product that never switched it on', async () => {
        const product = await createProduct({ onHand: 0 });

        const response = await api().get(`/products/${String(product._id)}`);

        expect(response.body.data.backorder).toBe(false);
    });

    it('reads sold out once the restock date has passed, with nothing run', async () => {
        const id = await backorderProduct({ restockDate: inDays(-1) });

        const response = await api().get(`/products/${id}`);

        expect(response.body.data).toMatchObject({ backorder: false, inStock: false });
    });

    it('is a preorder, not a backorder, before its release date', async () => {
        const id = await backorderProduct({ releaseDate: inDays(30) });

        const response = await api().get(`/products/${id}`);

        expect(response.body.data).toMatchObject({ preorder: true, backorder: false });
    });

    it('stops being open when the cap is full', async () => {
        const id = await backorderProduct();
        await productModel.updateOne({ _id: id }, { $set: { backordered: 5 } });

        const response = await api().get(`/products/${id}`);

        expect(response.body.data.backorder).toBe(false);
    });
});

describe('PATCH /products/:id', () => {
    it('switches backorder on and sets, then clears, the restock date', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct();
        const id = String(product._id);
        const restockDate = inDays(14);

        const set = await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ allowBackorder: true, restockDate });
        const cleared = await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ restockDate: null });

        expect(set.body.data).toMatchObject({ allowBackorder: true, restockDate });
        expect(cleared.body.data.restockDate).toBeUndefined();
        expect(cleared.body.data.allowBackorder).toBe(true);
    });

    it('refuses a date more than a year ahead and writes nothing', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct();

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ restockDate: inDays(400) });

        expect(response.status).toBe(422);
        const stored = await productModel.findById(product._id);
        expect(stored?.restockDate).toBeUndefined();
    });

    it('accepts a date in the past: the product then reads sold out', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct();

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ allowBackorder: true, restockDate: inDays(-5) });

        expect(response.status).toBe(200);
        expect(response.body.data.backorder).toBe(false);
    });
});
