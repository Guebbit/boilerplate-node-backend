/**
 * @module
 * Contract tests for the availability reads under `/products`: one product and many, the batch
 * bound, the omission rule, and who may see a hidden product. The rule that turns settings and
 * counts into a value lives in the products unit suite.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { MISSING_ID } from '@tests/ids';
import { BACKORDER_PROMISE_DAYS, shopDayOf } from '@modules/shop';
import { DAY_MS } from '@domain-primitives/time';

setupTestDb();

/** A repeated `id` query string. */
const query = (list: string[]) => list.map((id) => `id=${id}`).join('&');

describe('GET /products/{id}/availability', () => {
    it('answers a guest in_stock for a product with shelf units, with no date', async () => {
        const product = await createProduct({ onHand: 4 });

        const response = await api().get(`/products/${String(product._id)}/availability`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ productId: String(product._id), availability: 'in_stock' });
        expect(response.headers['cache-control']).toBe('public, no-cache');
    });

    it('answers out_of_stock for an empty shelf', async () => {
        const product = await createProduct({ onHand: 0 });

        const response = await api().get(`/products/${String(product._id)}/availability`);

        expect(response.body.availability).toBe('out_of_stock');
    });

    it('answers a preorder with the release day as availabilityDate', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 0, releaseDate: '2999-01-05' });
        await api()
            .patch(`/inventory/levels/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ backorderLimit: 10 });

        const response = await api().get(`/products/${String(product._id)}/availability`);

        expect(response.body).toEqual({
            productId: String(product._id),
            availability: 'preorder',
            availabilityDate: '2999-01-05'
        });
    });

    it('answers a backorder with the restock day as availabilityDate', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({
            onHand: 0,
            allowBackorder: true,
            restockDate: '2999-03-01'
        });
        await api()
            .patch(`/inventory/levels/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ backorderLimit: null });

        const response = await api().get(`/products/${String(product._id)}/availability`);

        expect(response.body).toMatchObject({
            availability: 'backorder',
            availabilityDate: '2999-03-01'
        });
    });

    it('promises a backorder with no restock date the shop day 30 days from now', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 0, allowBackorder: true });
        await api()
            .patch(`/inventory/levels/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ backorderLimit: 5 });

        const response = await api().get(`/products/${String(product._id)}/availability`);

        expect(response.body).toMatchObject({
            availability: 'backorder',
            availabilityDate: shopDayOf(new Date(Date.now() + BACKORDER_PROMISE_DAYS * DAY_MS))
        });
    });

    it('answers 404 for an unknown product and a malformed id alike', async () => {
        const unknown = await api().get(`/products/${MISSING_ID}/availability`);
        const malformed = await api().get('/products/not-an-id/availability');

        expect([unknown.status, malformed.status]).toEqual([404, 404]);
    });

    it('hides an inactive product from a guest and shows it to an admin', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 4, active: false });
        const path = `/products/${String(product._id)}/availability`;

        const guest = await api().get(path);
        const admin = await api().get(path).set('Authorization', bearer);

        expect(guest.status).toBe(404);
        expect(admin.status).toBe(200);
        expect(admin.body.availability).toBe('out_of_stock');
    });

    it('revalidates: the same answer twice gives a 304 on the ETag', async () => {
        const product = await createProduct({ onHand: 4 });
        const path = `/products/${String(product._id)}/availability`;

        const first = await api().get(path);
        const second = await api().get(path).set('If-None-Match', first.headers.etag);

        expect(second.status).toBe(304);
    });
});

describe('GET /products/availability', () => {
    it('answers every product asked for, and is answered by inventory rather than /products/:id', async () => {
        const stocked = await createProduct({ title: 'Stocked', onHand: 4 });
        const empty = await createProduct({ title: 'Empty', onHand: 0 });

        const response = await api().get(
            `/products/availability?id=${String(stocked._id)}&id=${String(empty._id)}`
        );

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(2);
        expect(response.body.items).toEqual(
            expect.arrayContaining([
                { productId: String(stocked._id), availability: 'in_stock' },
                { productId: String(empty._id), availability: 'out_of_stock' }
            ])
        );
    });

    it('leaves out an unknown id and answers the rest', async () => {
        const product = await createProduct({ onHand: 4 });

        const response = await api().get(
            `/products/availability?id=${MISSING_ID}&id=${String(product._id)}`
        );

        expect(response.status).toBe(200);
        expect(response.body.items.map((item: { productId: string }) => item.productId)).toEqual([
            String(product._id)
        ]);
    });

    it('answers a duplicated id once', async () => {
        const product = await createProduct({ onHand: 4 });
        const id = String(product._id);

        const response = await api().get(`/products/availability?id=${id}&id=${id}`);

        expect(response.body.items).toHaveLength(1);
    });

    it('leaves a hidden product out for a guest and in for an admin', async () => {
        const { bearer } = await authenticateAs('admin');
        const visible = await createProduct({ onHand: 4 });
        const hidden = await createProduct({ onHand: 4, active: false });
        const path = `/products/availability?id=${String(visible._id)}&id=${String(hidden._id)}`;

        const guest = await api().get(path);
        const admin = await api().get(path).set('Authorization', bearer);

        expect(guest.body.items).toHaveLength(1);
        expect(admin.body.items).toHaveLength(2);
    });

    it('accepts 100 ids and refuses a 101st with a 422', async () => {
        const ids = Array.from({ length: 101 }, () => MISSING_ID);

        const accepted = await api().get(`/products/availability?${query(ids.slice(0, 100))}`);
        const refused = await api().get(`/products/availability?${query(ids)}`);

        expect(accepted.status).toBe(200);
        expect(refused.status).toBe(422);
    });

    it('answers 422 for a malformed id, naming the field', async () => {
        const response = await api().get('/products/availability?id=not-an-id');

        expect(response.status).toBe(422);
        expect(response.body.errors[0]).toMatchObject({
            code: 'VALIDATION_ERROR',
            details: { field: expect.stringMatching(/^id(\.\d+)?$/) }
        });
    });
});
