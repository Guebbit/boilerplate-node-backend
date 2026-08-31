/**
 * @module
 * Contract tests for /payments.
 *
 * Every route requires authentication and answers the same `PaymentEnvelope`; what these pin is
 * that each contract branch — the 201 intent, the 200 confirm, the three distinguishable 409s,
 * the 404s — is actually reached over HTTP. The money rules live in the unit suite.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/fixtures';
import { createOrder, toOrderItem } from '@modules/orders/tests/fixtures';
import { FAKE_DECLINE_CARD } from '@modules/payments/providers/fake';

setupTestDb();

/** A valid ObjectId that is guaranteed not to exist — the 404 branch, not the 422 one. */
const MISSING_ID = '65dc8a99604c307b702b5ccc';

const GOOD_CARD = '4242424242424242';

/** Logs a customer in with one pending order, returning both. */
const authenticateWithOrder = async () => {
    const { user, bearer } = await authenticateAs('user');
    const product = await createProduct({ price: 10 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    return { bearer, order };
};

/** The full intent, for the confirm cases. */
const authenticateWithIntent = async () => {
    const { bearer, order } = await authenticateWithOrder();
    const response = await api()
        .post('/payments/intent')
        .set('Authorization', bearer)
        .send({ orderId: String(order._id) });

    if (response.status !== 201)
        throw new Error(
            `payments setup failed: POST /payments/intent returned ${response.status} — ${JSON.stringify(response.body)}`
        );

    return { bearer, order, paymentId: String(response.body.data.id) };
};

describe('POST /payments/intent', () => {
    it('matches the contract for a fresh intent', async () => {
        const { bearer, order } = await authenticateWithOrder();

        const response = await api()
            .post('/payments/intent')
            .set('Authorization', bearer)
            .send({ orderId: String(order._id) });

        expect(response.status).toBe(201);
        expect(response.body.data.amount).toBe(20);
        expect(response.body.data.status).toBe('requires_confirmation');
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an order that does not exist', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post('/payments/intent')
            .set('Authorization', bearer)
            .send({ orderId: MISSING_ID });

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an invalid body', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().post('/payments/intent').set('Authorization', bearer).send({});

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().post('/payments/intent').send({ orderId: MISSING_ID });

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /payments/{id}/confirm', () => {
    it('matches the contract for a successful charge', async () => {
        const { bearer, paymentId } = await authenticateWithIntent();

        const response = await api()
            .post(`/payments/${paymentId}/confirm`)
            .set('Authorization', bearer)
            .send({ cardNumber: GOOD_CARD });

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('succeeded');
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a declined card', async () => {
        const { bearer, paymentId } = await authenticateWithIntent();

        const response = await api()
            .post(`/payments/${paymentId}/confirm`)
            .set('Authorization', bearer)
            .send({ cardNumber: FAKE_DECLINE_CARD });

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('PAYMENT_DECLINED');
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a payment that does not exist', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post(`/payments/${MISSING_ID}/confirm`)
            .set('Authorization', bearer)
            .send({ cardNumber: GOOD_CARD });

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an invalid card number', async () => {
        const { bearer, paymentId } = await authenticateWithIntent();

        const response = await api()
            .post(`/payments/${paymentId}/confirm`)
            .set('Authorization', bearer)
            .send({ cardNumber: 'not-a-card' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });
});

describe('GET /payments/order/{orderId}', () => {
    it('matches the contract for the caller`s own payment', async () => {
        const { bearer, order } = await authenticateWithIntent();

        const response = await api()
            .get(`/payments/order/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.orderId).toBe(String(order._id));
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when no intent exists yet', async () => {
        const { bearer, order } = await authenticateWithOrder();

        const response = await api()
            .get(`/payments/order/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });
});
