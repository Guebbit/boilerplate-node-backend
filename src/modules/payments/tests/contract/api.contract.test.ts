/**
 * @module
 * Contract tests for /payments. Every route requires authentication and answers the same
 * `PaymentEnvelope`; what these pin is that each contract branch — the 201 intent, the 200
 * confirm, the three distinguishable 409s, the 404s — is actually reached over HTTP. The money
 * rules live in the unit suite.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { signWebhookPayload, WEBHOOK_SIGNATURE_HEADER } from '@modules/payments/providers';
import { paymentRepository } from '@modules/payments/repository';
import { inventoryService } from '@modules/inventory';
import { onDomainEvent } from '@kernel/events';
import { ORDER_STATUS_CHANGED } from '@modules/orders';

setupTestDb();

/** A valid ObjectId that is guaranteed not to exist — the 404 branch, not the 422 one. */
const MISSING_ID = '65dc8a99604c307b702b5ccc';

// Literals, not imported from `providers/fake` — a contract test's inputs come from what the
// contract itself publishes (openapi.yaml: "recognises `pm_card_visa` (succeeds),
// `pm_card_declined`, …"), not from the code the contract describes. Importing the module under
// test would make a rename of either value pass silently while the contract quietly became a lie.
const GOOD_METHOD = 'pm_card_visa';
const DECLINE_METHOD = 'pm_card_declined';

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

/** A customer who paid in full, over HTTP — the fixture the refund tests start from. */
const paidOrder = async () => {
    const { bearer, order, paymentId } = await authenticateWithIntent();
    const confirmed = await api()
        .post(`/payments/${paymentId}/confirm`)
        .set('Authorization', bearer)
        .send({ paymentMethodRef: GOOD_METHOD });

    if (confirmed.status !== 200 || confirmed.body.data?.status !== 'succeeded')
        throw new Error(
            `payments setup failed: POST /payments/${paymentId}/confirm returned ${confirmed.status} — ${JSON.stringify(confirmed.body)}`
        );

    return { bearer, order, paymentId };
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

    it('never publishes the provider reference, and returns the client secret only here', async () => {
        // Two opposite rules on one response. `providerRef` operates on real money at the provider
        // and no client has an operation that needs it. `clientSecret` authorises COMPLETING this
        // payment, so it must reach the browser exactly once and be stored nowhere.
        const { bearer, order } = await authenticateWithOrder();

        const intent = await api()
            .post('/payments/intent')
            .set('Authorization', bearer)
            .send({ orderId: String(order._id) });
        const readBack = await api()
            .get(`/payments/order/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(intent.body.data).not.toHaveProperty('providerRef');
        expect(intent.body.data.clientSecret).toEqual(expect.any(String));
        expect(readBack.body.data).not.toHaveProperty('providerRef');
        expect(readBack.body.data).not.toHaveProperty('clientSecret');
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
});

describe('POST /payments/{id}/confirm', () => {
    it('matches the contract for a successful charge', async () => {
        const { bearer, paymentId } = await authenticateWithIntent();

        const response = await api()
            .post(`/payments/${paymentId}/confirm`)
            .set('Authorization', bearer)
            .send({ paymentMethodRef: GOOD_METHOD });

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('succeeded');
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a declined card', async () => {
        const { bearer, paymentId } = await authenticateWithIntent();

        const response = await api()
            .post(`/payments/${paymentId}/confirm`)
            .set('Authorization', bearer)
            .send({ paymentMethodRef: DECLINE_METHOD });

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('PAYMENT_DECLINED');
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a payment that does not exist', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post(`/payments/${MISSING_ID}/confirm`)
            .set('Authorization', bearer)
            .send({ paymentMethodRef: GOOD_METHOD });

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a method reference the contract does not allow', async () => {
        const { bearer, paymentId } = await authenticateWithIntent();

        const response = await api()
            .post(`/payments/${paymentId}/confirm`)
            .set('Authorization', bearer)
            // Spaces are exactly what a card number typed into a form carries — and the contract
            // now refuses that shape, which is the point of the field being a provider handle.
            .send({ paymentMethodRef: '4242 4242 4242 4242' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it.each([
        ['too short', 'ab'],
        ['too long', 'a'.repeat(256)]
    ])('matches the error contract for a %s method reference', async (_label, paymentMethodRef) => {
        // The contract states minLength: 3 and maxLength: 255 — only the `pattern` half (spaces,
        // above) was ever exercised, so a length regression on either bound had nothing to fail it.
        const { bearer, paymentId } = await authenticateWithIntent();

        const response = await api()
            .post(`/payments/${paymentId}/confirm`)
            .set('Authorization', bearer)
            .send({ paymentMethodRef });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('answers 200 with the payment still in flight when the bank wants a challenge', async () => {
        const { bearer, paymentId } = await authenticateWithIntent();

        const response = await api()
            .post(`/payments/${paymentId}/confirm`)
            .set('Authorization', bearer)
            .send({ paymentMethodRef: 'pm_card_authentication_required' });

        // A 4xx here would tell the browser to stop, and the browser is the only thing that can
        // answer the challenge.
        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('requires_action');
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /payments/{id}/sync', () => {
    it('settles a payment the browser finished at the provider', async () => {
        const { bearer, paymentId } = await authenticateWithIntent();
        await api()
            .post(`/payments/${paymentId}/confirm`)
            .set('Authorization', bearer)
            .send({ paymentMethodRef: 'pm_card_authentication_required' });

        const response = await api()
            .post(`/payments/${paymentId}/sync`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('succeeded');
        expect(response).toSatisfyApiSpec();
    });

    it('answers an already-succeeded payment as it stands, without asking the provider again', async () => {
        // Not the idempotency test its old name claimed — this calls sync exactly ONCE, against a
        // payment the confirm above already settled. What it actually pins is the terminal
        // early-return branch: a payment outside SETTLEABLE_PAYMENT_STATUSES is answered from the
        // row alone, spending no call to be told what it already knows.
        const { bearer, paymentId } = await authenticateWithIntent();
        await api()
            .post(`/payments/${paymentId}/confirm`)
            .set('Authorization', bearer)
            .send({ paymentMethodRef: GOOD_METHOD });

        const response = await api()
            .post(`/payments/${paymentId}/sync`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('succeeded');
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a payment that does not exist', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post(`/payments/${MISSING_ID}/sync`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });
});

/** Posts a body with the signature a provider would have sent over those exact bytes. */
const deliver = (event: unknown, signature?: string) => {
    const body = JSON.stringify(event);
    return api()
        .post('/payments/webhook')
        .set('Content-Type', 'application/json')
        .set(WEBHOOK_SIGNATURE_HEADER, signature ?? signWebhookPayload(body))
        .send(body);
};

/**
 * An intent nobody has confirmed — the state a webhook normally arrives into. The reference is read
 * from the ROW, because it is deliberately not published.
 */
const preparedPayment = async () => {
    const { bearer, order, paymentId } = await authenticateWithIntent();
    const payment = await paymentRepository.findById(paymentId);
    return { bearer, order, paymentId, providerRef: String(payment!.providerRef) };
};

describe('POST /payments/webhook', () => {
    it('settles a payment on a signed delivery, with no session of any kind', async () => {
        const { paymentId, providerRef } = await preparedPayment();

        const response = await deliver({
            id: `evt_${paymentId}`,
            providerRef,
            status: 'succeeded',
            cardLast4: '4242'
        });

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        const settled = await paymentRepository.findById(paymentId);
        expect(settled!.status).toBe('succeeded');
    });

    it('answers a MessageResponse, not the PaymentEnvelope every other route answers', async () => {
        // A deliberate shape difference: the caller is a machine with no use for the payment back,
        // and `toSatisfyApiSpec()` alone would pass a `PaymentEnvelope` here too, since the two
        // schemas overlap on `success`/`status`. This is the one assertion that would catch a
        // controller change that started leaking the payment into the webhook's own response.
        const { providerRef } = await preparedPayment();

        const response = await deliver({
            id: 'evt_envelope_shape',
            providerRef,
            status: 'succeeded'
        });

        expect(response.body).not.toHaveProperty('data');
        expect(Object.keys(response.body).toSorted()).toEqual(['message', 'status', 'success']);
    });

    it('refuses a delivery nobody signed', async () => {
        const { providerRef } = await preparedPayment();

        const response = await deliver(
            { id: 'evt_forged', providerRef, status: 'succeeded' },
            `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`
        );

        expect(response.status).toBe(400);
        expect(response).toSatisfyApiSpec();
    });

    it('applies a repeated delivery once', async () => {
        const { paymentId, providerRef, order } = await preparedPayment();
        const event = {
            id: `evt_replay_${paymentId}`,
            providerRef,
            status: 'succeeded' as const
        };

        // What the ledger actually protects: `first`/`replay` alone answer 200 on both branches
        // (dedup vs. fresh apply), so a status-only assertion can never fail on a broken ledger.
        const commitSpy = jest.spyOn(inventoryService, 'commitForOrder');
        const statusChanges: unknown[] = [];
        onDomainEvent(ORDER_STATUS_CHANGED, (payload) => {
            if (payload.orderId === String(order._id)) statusChanges.push(payload);
        });

        const first = await deliver(event);
        const replay = await deliver(event);

        // 200 either way — a provider reads anything else as a failed delivery and retries harder.
        expect(first.status).toBe(200);
        expect(replay.status).toBe(200);
        expect(replay).toSatisfyApiSpec();

        expect(commitSpy).toHaveBeenCalledTimes(1);
        expect(statusChanges).toHaveLength(1);
        commitSpy.mockRestore();
    });

    it('accepts an event about an intent it does not know, rather than making the provider retry', async () => {
        const response = await deliver({
            id: 'evt_unknown',
            providerRef: 'fake_pi_nobody',
            status: 'succeeded' as const
        });

        expect(response.status).toBe(200);
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

describe('POST /payments/order/{orderId}/refund', () => {
    it('refuses the order`s own owner — the refund is admin-only', async () => {
        // "Own order" matters here specifically: a mis-ordered guard that checked ownership before
        // admin status would let exactly this caller through, and a stranger's order would not
        // have caught it.
        const { bearer, order, paymentId } = await paidOrder();

        const response = await api()
            .post(`/payments/order/${String(order._id)}/refund`)
            .set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
        const payment = await paymentRepository.findById(paymentId);
        expect(payment!.status).toBe('succeeded');
    });
});
