/**
 * @module
 * A product's `releaseDate`, over HTTP: a future date makes it a preorder (derived, never
 * stored), the date is bounded to a year ahead, and moving it announces `product.release_date_changed`
 * through the outbox in the edit's own transaction.
 *
 * @see docs/modules/products.md#preorder
 */

import { api, authenticateAsRole } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { outboxEventModel } from '@kernel/outbox';
import { productService } from '../../services';
import { shopDayOf, startOfShopDay } from '@modules/shop';
import { PRODUCT_RELEASE_DATE_CHANGED } from '../../events';

setupTestDb();

/** The shop day `days` from now, as the `YYYY-MM-DD` a client sends. */
const inDays = (days: number): string => shopDayOf(new Date(Date.now() + days * 86_400_000));

/** What a stored day is: the shop's midnight of it, as the ISO instant the factory takes. */
const stored = (day: string): string => startOfShopDay(day).toISOString();

/** The `product.release_date_changed` rows written so far. */
const announced = () =>
    outboxEventModel.find({ name: PRODUCT_RELEASE_DATE_CHANGED }).sort({ _id: 1 }).lean().exec();

/** What those rows carry, in write order. */
const announcedPayloads = () => announced().then((rows) => rows.map(({ payload }) => payload));

describe('GET /products/:id', () => {
    it('flags a product with a future release date as a preorder, and shows the date', async () => {
        const releaseDate = inDays(30);
        const product = await createProduct({ releaseDate: stored(releaseDate) });

        const response = await api().get(`/products/${String(product._id)}`);

        expect(response.body).toMatchObject({ preorder: true, releaseDate });
    });

    it('stops being a preorder once the date has passed, with nothing run', async () => {
        const product = await createProduct({ releaseDate: stored(inDays(-1)) });

        const response = await api().get(`/products/${String(product._id)}`);

        expect(response.body.preorder).toBe(false);
    });

    it('is not a preorder when it is off sale', async () => {
        const product = await createProduct({
            releaseDate: stored(inDays(30)),
            purchasable: false
        });

        const response = await api().get(`/products/${String(product._id)}`);

        expect(response.body.preorder).toBe(false);
    });

    it('never calls a preorder low on stock', async () => {
        const product = await createProduct({ releaseDate: stored(inDays(30)), onHand: 1 });

        const response = await api().get(`/products/${String(product._id)}`);

        expect(response.body).toMatchObject({ preorder: true, lowStock: false });
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

        expect(set.body).toMatchObject({ preorder: true, releaseDate });
        expect(cleared.body.releaseDate).toBeUndefined();
        expect(cleared.body.preorder).toBe(false);
        const payloads = await announcedPayloads();
        expect(payloads).toEqual([
            { productId: id, to: stored(releaseDate) },
            { productId: id, from: stored(releaseDate) }
        ]);
    });

    it('announces the move from the old date to the new one', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const from = inDays(30);
        const to = inDays(60);
        const product = await createProduct({ releaseDate: stored(from) });

        await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ releaseDate: to })
            .expect(200);

        const payloads = await announcedPayloads();
        expect(payloads).toEqual([
            {
                productId: String(product._id),
                from: stored(from),
                to: stored(to)
            }
        ]);
    });

    it('announces nothing when the day is the one already stored', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const releaseDate = inDays(30);
        const product = await createProduct({ releaseDate: stored(releaseDate) });

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
        expect(response.body.preorder).toBe(false);
    });
});

describe('a release day is stored as the shop midnight', () => {
    /**
     * Rome springs forward on 2026-03-29 and falls back on 2026-10-25 (both at 01:00 UTC): the
     * day of the change is 23 and 25 hours long, so its midnight is the edge a naive offset misses.
     */
    it.each([
        ['the spring-forward day', '2026-03-29', '2026-03-28T23:00:00.000Z'],
        ['the fall-back day', '2026-10-25', '2026-10-24T22:00:00.000Z']
    ])(
        'keeps %s on its own midnight and reads it back as the same day',
        async (_name, day, instant) => {
            const { bearer } = await authenticateAsRole('editor');
            const product = await createProduct();
            const id = String(product._id);

            const response = await api()
                .patch(`/products/${id}`)
                .set('Authorization', bearer)
                .send({ releaseDate: day })
                .expect(200);

            expect(response.body.releaseDate).toBe(day);
            const saved = await productService.findByIdRaw(id);
            expect(saved?.releaseDate?.toISOString()).toBe(instant);
            const read = await api().get(`/products/${id}`);
            expect(read.body.releaseDate).toBe(day);
        }
    );

    it('refuses an instant: a promise is a day', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct();

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ releaseDate: '2027-01-05T10:00:00.000Z' });

        expect(response.status).toBe(422);
    });
});
