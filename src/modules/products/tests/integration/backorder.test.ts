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
import { outboxEventModel } from '@kernel/outbox';
import { productModel } from '../../model';
import { productService } from '../../services';
import { PRODUCT_BUYABLE_AGAIN, PRODUCT_RESTOCK_DATE_CHANGED } from '../../events';

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

/** The `product.restock_date_changed` payloads written so far, in order. */
const announced = () =>
    outboxEventModel
        .find({ name: PRODUCT_RESTOCK_DATE_CHANGED })
        .sort({ _id: 1 })
        .lean()
        .exec()
        .then((rows) => rows.map(({ payload }) => payload));

describe('PATCH /products/:id restockDate announcements', () => {
    it('announces a date set, moved and cleared, each with what it was and what it became', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct();
        const id = String(product._id);
        const [first, second] = [inDays(10), inDays(20)];
        const patch = (restockDate: string | null) =>
            api().patch(`/products/${id}`).set('Authorization', bearer).send({ restockDate });

        await patch(first);
        await patch(second);
        await patch(null);

        expect(await announced()).toEqual([
            { productId: id, to: first },
            { productId: id, from: first, to: second },
            { productId: id, from: second }
        ]);
    });

    it('announces nothing when the date it already has is saved again', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const restockDate = inDays(10);
        const product = await createProduct({ restockDate });

        await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ restockDate });

        expect(await announced()).toEqual([]);
    });
});

/** How many `product.buyable_again` rows exist for the product. */
const fired = (id: string) =>
    outboxEventModel.countDocuments({ name: PRODUCT_BUYABLE_AGAIN, aggregateId: id });

/** The id of a freshly made product. */
const idOf = (product: { _id: unknown }) => String(product._id);

describe('product.buyable_again', () => {
    it('fires once when synced stock makes a sold-out product orderable, and not again while it is', async () => {
        const product = await createProduct({ onHand: 0 });
        const id = String(product._id);

        await productService.syncStockCache(id, { onHand: 4, reserved: 0 });
        await productService.syncStockCache(id, { onHand: 9, reserved: 0 });
        await productService.syncStockCache(id, { onHand: 9, reserved: 9 });
        await productService.syncStockCache(id, { onHand: 9, reserved: 0 });

        expect(await fired(id)).toBe(2);
    });

    it('fires when an edit switches backorder on, shows the product again, or moves a passed restock date', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const patch = (id: string, body: object) =>
            api().patch(`/products/${id}`).set('Authorization', bearer).send(body);
        const switched = idOf(await createProduct({ onHand: 0 }));
        await productModel.updateOne({ _id: switched }, { $set: { backorderLimit: 5 } });
        const hidden = idOf(await createProduct({ onHand: 3, active: false }));
        const missed = idOf(
            await createProduct({ onHand: 0, allowBackorder: true, restockDate: inDays(-2) })
        );
        await productModel.updateOne({ _id: missed }, { $set: { backorderLimit: 5 } });

        await patch(switched, { allowBackorder: true });
        await patch(hidden, { active: true });
        await patch(missed, { restockDate: inDays(10) });
        await patch(switched, { description: 'unrelated' });

        expect([await fired(switched), await fired(hidden), await fired(missed)]).toEqual([
            1, 1, 1
        ]);
    });
});
