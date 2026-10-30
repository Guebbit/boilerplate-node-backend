/**
 * @module
 * Contract tests for /inventory — pins each contract branch reached over HTTP: the two reads,
 * the two write transitions with their 200/404/409/422, the sweep, and the 401/403 that keep
 * the counters off a customer's screen. The transitions' own rules live in the unit suite.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { MISSING_ID } from '@tests/ids';

setupTestDb();

describe('GET /inventory/levels', () => {
    it('matches the contract and reports all three numbers', async () => {
        const { bearer } = await authenticateAs('admin');
        await createProduct({ onHand: 7 });

        const response = await api().get('/inventory/levels').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items[0]).toMatchObject({
            onHand: 7,
            reserved: 0,
            available: 7
        });
        expect(response.body.meta).toMatchObject({ totalItems: 1, totalPages: 1 });
    });

    it('matches the contract when narrowed to what needs ordering', async () => {
        const { bearer } = await authenticateAs('admin');
        await createProduct({ title: 'Plenty', onHand: 5000 });

        const response = await api()
            .get('/inventory/levels?lowOnly=true')
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(0);
        expect(response.body.meta.totalItems).toBe(0);
    });

    it('pages the board rather than reading the whole catalogue', async () => {
        const { bearer } = await authenticateAs('admin');
        for (let index = 0; index < 5; index += 1)
            await createProduct({ title: `P${index}`, onHand: index });

        const response = await api()
            .get('/inventory/levels?page=2&pageSize=2')
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(2);
        expect(response.body.meta).toMatchObject({ totalItems: 5, totalPages: 3 });
    });
});

describe('GET /inventory/levels/{productId}', () => {
    it('reads one product’s counters', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 7 });

        const response = await api()
            .get(`/inventory/levels/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ onHand: 7, reserved: 0, available: 7 });
    });

    it('answers 404 for an unknown product and a malformed id alike', async () => {
        const { bearer } = await authenticateAs('admin');

        const unknown = await api()
            .get(`/inventory/levels/${MISSING_ID}`)
            .set('Authorization', bearer);
        const malformed = await api()
            .get('/inventory/levels/not-an-id')
            .set('Authorization', bearer);

        expect([unknown.status, malformed.status]).toEqual([404, 404]);
    });

    it('refuses a customer with 403', async () => {
        const { bearer } = await authenticateAs('user');
        const product = await createProduct({ onHand: 7 });

        const response = await api()
            .get(`/inventory/levels/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(403);
    });
});

describe('GET /inventory/movements', () => {
    it('matches the contract for an empty ledger', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().get('/inventory/movements').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(0);
        expect(response.body.meta).toMatchObject({ totalItems: 0, totalPages: 0 });
    });

    it('pages the ledger rather than truncating it', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 0 });
        for (let index = 0; index < 5; index += 1)
            await api()
                .post(`/inventory/levels/${String(product._id)}/receive`)
                .set('Authorization', bearer)
                .send({ quantity: 1 });

        const response = await api()
            .get(`/inventory/movements?productId=${String(product._id)}&page=2&pageSize=2`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(2);
        // `totalItems` counts everything matching the filters, not the page — which is what lets
        // an audit see that there is more history than it is currently looking at.
        expect(response.body.meta).toMatchObject({
            page: 2,
            pageSize: 2,
            totalItems: 5,
            totalPages: 3
        });
    });

    it('narrows the ledger to one kind of transition', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        await api()
            .post(`/inventory/levels/${String(product._id)}/receive`)
            .set('Authorization', bearer)
            .send({ quantity: 5 });
        await api()
            .post(`/inventory/levels/${String(product._id)}/adjust`)
            .set('Authorization', bearer)
            .send({ delta: -2 });

        const response = await api()
            .get(`/inventory/movements?productId=${String(product._id)}&reason=adjust`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(1);
        expect(response.body.items[0].reason).toBe('adjust');
    });

    it('matches the contract for a ledger holding rows, narrowed by product', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        await api()
            .post(`/inventory/levels/${String(product._id)}/receive`)
            .set('Authorization', bearer)
            .send({ quantity: 5 });

        const response = await api()
            .get(`/inventory/movements?productId=${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(1);
        // Both deltas on the row, which is what makes the ledger replayable.
        expect(response.body.items[0]).toMatchObject({
            reason: 'receive',
            onHandDelta: 5,
            reservedDelta: 0
        });
    });
});

describe('POST /inventory/levels/{productId}/receive', () => {
    it('matches the contract and answers the counters after the delivery', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 3 });

        const response = await api()
            .post(`/inventory/levels/${String(product._id)}/receive`)
            .set('Authorization', bearer)
            .send({ quantity: 7 });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ onHand: 10, reserved: 0, available: 10 });
    });

    it('matches the error contract for an unknown product', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post(`/inventory/levels/${MISSING_ID}/receive`)
            .set('Authorization', bearer)
            .send({ quantity: 7 });

        expect(response.status).toBe(404);
    });

    it('matches the error contract for an invalid body', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .post(`/inventory/levels/${String(product._id)}/receive`)
            .set('Authorization', bearer)
            .send({ quantity: 0 });

        expect(response.status).toBe(422);
    });
});

describe('POST /inventory/levels/{productId}/adjust', () => {
    it('matches the contract for a correction in either direction', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 10 });

        const response = await api()
            .post(`/inventory/levels/${String(product._id)}/adjust`)
            .set('Authorization', bearer)
            .send({ delta: -4, note: 'damaged in transit' });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ onHand: 6, available: 6 });
    });

    it('matches the error contract when the correction goes below what is reserved', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 10, reserved: 8 });

        const response = await api()
            .post(`/inventory/levels/${String(product._id)}/adjust`)
            .set('Authorization', bearer)
            .send({ delta: -5 });

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('INVENTORY_BELOW_RESERVED');
    });

    it('matches the error contract for a zero correction', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .post(`/inventory/levels/${String(product._id)}/adjust`)
            .set('Authorization', bearer)
            .send({ delta: 0 });

        expect(response.status).toBe(422);
        expect(response.body.errors[0]).toMatchObject({
            code: 'VALIDATION_ERROR',
            details: { field: 'delta' }
        });
    });
});

describe('POST /inventory/reservations/sweep', () => {
    it('matches the contract with nothing to expire', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/inventory/reservations/sweep')
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ expired: 0 });
    });
});

describe('GET /inventory/preorders', () => {
    it('matches the contract for a product with an allowance', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({
            onHand: 0,
            releaseDate: new Date(Date.now() + 86_400_000).toISOString()
        });
        await api()
            .patch(`/inventory/levels/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ backorderLimit: 6 });

        const response = await api().get('/inventory/preorders').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toMatchObject([
            {
                productId: String(product._id),
                backorderLimit: 6,
                backordered: 0,
                held: 0,
                paid: 0,
                left: 6,
                ordered: 0
            }
        ]);
        expect(response.body.meta).toMatchObject({ totalItems: 1 });
    });
});

describe('PATCH /inventory/levels/:productId', () => {
    it('matches the contract and answers the level with its new allowance', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 3 });

        const response = await api()
            .patch(`/inventory/levels/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ backorderLimit: 8 });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ onHand: 3, backorderLimit: 8, backordered: 0 });
    });

    it('answers the level untouched when the body names no field', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 3 });
        const url = `/inventory/levels/${String(product._id)}`;
        await api().patch(url).set('Authorization', bearer).send({ backorderLimit: 5 });

        const response = await api().patch(url).set('Authorization', bearer).send({});

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ backorderLimit: 5 });
    });

    it('lets a null remove the cap', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 3 });
        const url = `/inventory/levels/${String(product._id)}`;
        await api().patch(url).set('Authorization', bearer).send({ backorderLimit: 5 });

        const response = await api()
            .patch(url)
            .set('Authorization', bearer)
            .set('Content-Type', 'application/merge-patch+json')
            .send({ backorderLimit: null });

        expect(response.status).toBe(200);
        expect(response.body).not.toHaveProperty('backorderLimit');
    });

    it('is open to the warehouse and closed to a customer', async () => {
        const product = await createProduct({ onHand: 3 });
        const url = `/inventory/levels/${String(product._id)}`;
        const warehouse = await authenticateAsRole('warehouse');
        const customer = await authenticateAs('user');

        const allowed = await api()
            .patch(url)
            .set('Authorization', warehouse.bearer)
            .send({ backorderLimit: 2 });
        const refused = await api()
            .patch(url)
            .set('Authorization', customer.bearer)
            .send({ backorderLimit: 2 });

        expect(allowed.status).toBe(200);
        expect(refused.status).toBe(403);
    });

    it('matches the error contract for an unknown product', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .patch(`/inventory/levels/${MISSING_ID}`)
            .set('Authorization', bearer)
            .send({ backorderLimit: 8 });

        expect(response.status).toBe(404);
    });

    it.each([{ backorderLimit: -1 }, { backorderLimit: 1.5 }, { onHand: 5 }])(
        'matches the error contract for the body %j',
        async (body) => {
            const { bearer } = await authenticateAs('admin');
            const product = await createProduct();

            const response = await api()
                .patch(`/inventory/levels/${String(product._id)}`)
                .set('Authorization', bearer)
                .send(body);

            expect(response.status).toBe(422);
        }
    );
});
