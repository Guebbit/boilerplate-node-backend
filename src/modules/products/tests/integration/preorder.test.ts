/**
 * @module
 * A product's `releaseDate`, over HTTP: a future date makes it a preorder (derived, never
 * stored), the date is bounded to a year ahead, and moving it announces `product.release_date_changed`
 * through the outbox in the edit's own transaction.
 *
 * See: docs/modules/products.md#preorder
 */

import { api, authenticateAsRole } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { outboxEventModel } from '@kernel/outbox';
import { PRODUCT_RELEASE_DATE_CHANGED } from '../../events';

setupTestDb();

/** A date `days` from now, as the ISO string a client sends. */
const inDays = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString();

/** The `product.release_date_changed` rows written so far. */
const announced = () =>
    outboxEventModel.find({ name: PRODUCT_RELEASE_DATE_CHANGED }).sort({ _id: 1 }).lean().exec();

/** What those rows carry, in write order. */
const announcedPayloads = () => announced().then((rows) => rows.map(({ payload }) => payload));

describe('GET /products/:id', () => {
    it('flags a product with a future release date as a preorder, and shows the date', async () => {
        const releaseDate = inDays(30);
        const product = await createProduct({ releaseDate });

        const response = await api().get(`/products/${String(product._id)}`);

        expect(response.body.data).toMatchObject({ preorder: true, releaseDate });
    });

    it('stops being a preorder once the date has passed, with nothing run', async () => {
        const product = await createProduct({ releaseDate: inDays(-1) });

        const response = await api().get(`/products/${String(product._id)}`);

        expect(response.body.data.preorder).toBe(false);
    });

    it('is not a preorder when it is off sale', async () => {
        const product = await createProduct({ releaseDate: inDays(30), purchasable: false });

        const response = await api().get(`/products/${String(product._id)}`);

        expect(response.body.data.preorder).toBe(false);
    });

    it('never calls a preorder low on stock', async () => {
        const product = await createProduct({ releaseDate: inDays(30), onHand: 1 });

        const response = await api().get(`/products/${String(product._id)}`);

        expect(response.body.data).toMatchObject({ preorder: true, lowStock: false });
    });
});

describe('PATCH /products/:id releaseDate', () => {
    it('sets a date, announces it, and clears it with null', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct();
        const id = String(product._id);
        const releaseDate = inDays(30);

        const set = await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ releaseDate });
        const cleared = await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ releaseDate: null });

        expect(set.body.data).toMatchObject({ preorder: true, releaseDate });
        expect(cleared.body.data.releaseDate).toBeUndefined();
        expect(cleared.body.data.preorder).toBe(false);
        const payloads = await announcedPayloads();
        expect(payloads).toEqual([
            { productId: id, to: releaseDate },
            { productId: id, from: releaseDate }
        ]);
    });

    it('announces the move from the old date to the new one', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const from = inDays(30);
        const to = inDays(60);
        const product = await createProduct({ releaseDate: from });

        await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ releaseDate: to })
            .expect(200);

        const payloads = await announcedPayloads();
        expect(payloads).toEqual([{ productId: String(product._id), from, to }]);
    });

    it('announces nothing when the instant is the one already stored', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const releaseDate = inDays(30);
        const product = await createProduct({ releaseDate });

        await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ releaseDate })
            .expect(200);

        expect(await announced()).toHaveLength(0);
    });

    it('refuses a date more than a year ahead and writes nothing', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct();

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ releaseDate: inDays(400) });

        expect(response.status).toBe(422);
        expect(await announced()).toHaveLength(0);
    });

    it('accepts a date in the past: it simply reads as released', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct();

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ releaseDate: inDays(-5) });

        expect(response.status).toBe(200);
        expect(response.body.data.preorder).toBe(false);
    });
});
