/**
 * @module
 * A product's `allowBackorder` and `restockDate`, over HTTP: the switch and the date are written
 * and read back, the date is bounded to a year ahead, and a passed date is accepted. What a backorder
 * reads as is `availability`'s answer (`products/tests/unit/availability.test.ts`).
 *
 * @see docs/modules/products.md#backorder
 */

import { api, authenticateAsRole } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { outboxEventModel } from '@kernel/outbox';
import { shopDayOf, startOfShopDay } from '@modules/shop';
import { productModel } from '../../model';
import { PRODUCT_RESTOCK_DATE_CHANGED } from '../../events';

setupTestDb();

/** The shop day `days` from now, as the `YYYY-MM-DD` a client sends. */
const inDays = (days: number): string => shopDayOf(new Date(Date.now() + days * 86_400_000));

/** What a stored day is: the shop's midnight of it, as the ISO instant the factory takes. */
const stored = (day: string): string => startOfShopDay(day).toISOString();

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

        expect(set.body).toMatchObject({ allowBackorder: true, restockDate });
        expect(cleared.body.restockDate).toBeUndefined();
        expect(cleared.body.allowBackorder).toBe(true);
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
        expect(response.body.restockDate).toBe(inDays(-5));
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
            { productId: id, to: stored(first) },
            { productId: id, from: stored(first), to: stored(second) },
            { productId: id, from: stored(second) }
        ]);
    });

    it('announces nothing when the date it already has is saved again', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const restockDate = inDays(10);
        const product = await createProduct({ restockDate: stored(restockDate) });

        await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ restockDate });

        expect(await announced()).toEqual([]);
    });
});
