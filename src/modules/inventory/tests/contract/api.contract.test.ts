/**
 * @module
 * Contract tests for /inventory — pins each contract branch reached over HTTP: the two reads,
 * the two write transitions with their 200/404/409/422, the sweep, and the 401/403 that keep
 * the counters off a customer's screen. The transitions' own rules live in the unit suite.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/fixtures';

setupTestDb();

/**
 * A syntactically valid ObjectId no fixture or seed can hold — the 404 branch, not the 422 one.
 * All-`f` rather than a plausible-looking hex string: a value that merely looks unused risks
 * later colliding with a real seeded id, where this one cannot.
 */
const MISSING_ID = 'f'.repeat(24);

describe('GET /inventory/levels', () => {
    it('matches the contract and reports all three numbers', async () => {
        const { bearer } = await authenticateAs('admin');
        await createProduct({ onHand: 7 });

        const response = await api().get('/inventory/levels').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items[0]).toMatchObject({
            onHand: 7,
            reserved: 0,
            available: 7
        });
        expect(response.body.data.meta).toMatchObject({ totalItems: 1, totalPages: 1 });
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract when narrowed to what needs ordering', async () => {
        const { bearer } = await authenticateAs('admin');
        await createProduct({ title: 'Plenty', onHand: 5000 });

        const response = await api()
            .get('/inventory/levels?lowOnly=true')
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(0);
        expect(response.body.data.meta.totalItems).toBe(0);
        expect(response).toSatisfyApiSpec();
    });

    it('pages the board rather than reading the whole catalogue', async () => {
        const { bearer } = await authenticateAs('admin');
        for (let index = 0; index < 5; index += 1)
            await createProduct({ title: `P${index}`, onHand: index });

        const response = await api()
            .get('/inventory/levels?page=2&pageSize=2')
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(2);
        expect(response.body.data.meta).toMatchObject({ totalItems: 5, totalPages: 3 });
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a non-admin', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/inventory/levels').set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});

describe('GET /inventory/movements', () => {
    it('matches the contract for an empty ledger', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().get('/inventory/movements').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(0);
        expect(response.body.data.meta).toMatchObject({ totalItems: 0, totalPages: 0 });
        expect(response).toSatisfyApiSpec();
    });

    it('pages the ledger rather than truncating it', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 0 });
        for (let index = 0; index < 5; index += 1)
            await api()
                .post('/inventory/receipts')
                .set('Authorization', bearer)
                .send({ productId: String(product._id), quantity: 1 });

        const response = await api()
            .get(`/inventory/movements?productId=${String(product._id)}&page=2&pageSize=2`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(2);
        // `totalItems` counts everything matching the filters, not the page — which is what lets
        // an audit see that there is more history than it is currently looking at.
        expect(response.body.data.meta).toMatchObject({
            page: 2,
            pageSize: 2,
            totalItems: 5,
            totalPages: 3
        });
        expect(response).toSatisfyApiSpec();
    });

    it('narrows the ledger to one kind of transition', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 10 });
        await api()
            .post('/inventory/receipts')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 5 });
        await api()
            .post('/inventory/adjustments')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), delta: -2 });

        const response = await api()
            .get(`/inventory/movements?productId=${String(product._id)}&reason=adjust`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(1);
        expect(response.body.data.items[0].reason).toBe('adjust');
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract for a ledger holding rows, narrowed by product', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        await api()
            .post('/inventory/receipts')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 5 });

        const response = await api()
            .get(`/inventory/movements?productId=${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(1);
        // Both deltas on the row, which is what makes the ledger replayable.
        expect(response.body.data.items[0]).toMatchObject({
            reason: 'receive',
            onHandDelta: 5,
            reservedDelta: 0
        });
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a non-admin', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/inventory/movements').set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /inventory/receipts', () => {
    it('matches the contract and answers the counters after the delivery', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 3 });

        const response = await api()
            .post('/inventory/receipts')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 7 });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ onHand: 10, reserved: 0, available: 10 });
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an unknown product', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/inventory/receipts')
            .set('Authorization', bearer)
            .send({ productId: MISSING_ID, quantity: 7 });

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an invalid body', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/inventory/receipts')
            .set('Authorization', bearer)
            .send({ quantity: 0 });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api()
            .post('/inventory/receipts')
            .send({ productId: MISSING_ID, quantity: 1 });

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /inventory/adjustments', () => {
    it('matches the contract for a correction in either direction', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 10 });

        const response = await api()
            .post('/inventory/adjustments')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), delta: -4, note: 'damaged in transit' });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ onHand: 6, available: 6 });
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when the correction goes below what is reserved', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 10, reserved: 8 });

        const response = await api()
            .post('/inventory/adjustments')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), delta: -5 });

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('INVENTORY_BELOW_RESERVED');
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a zero correction', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 10 });

        const response = await api()
            .post('/inventory/adjustments')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), delta: 0 });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a non-admin', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post('/inventory/adjustments')
            .set('Authorization', bearer)
            .send({ productId: MISSING_ID, delta: 1 });

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /inventory/reservations/sweep', () => {
    it('matches the contract with nothing to expire', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/inventory/reservations/sweep')
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ expired: 0 });
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a non-admin', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post('/inventory/reservations/sweep')
            .set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});
