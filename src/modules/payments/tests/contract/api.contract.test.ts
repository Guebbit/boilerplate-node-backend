/**
 * @module
 * Contract tests for /payments. Every route requires authentication, and all but the reference
 * lookup answer the same `PaymentEnvelope` — that one answers an `Order`, being the step before a
 * payment exists. What these pin is that each contract branch — the 201 intent, the 200 confirm,
 * the three distinguishable 409s, the 404s — is actually reached over HTTP. The money rules live
 * in the unit suite.
 */

import { randomUUID } from 'node:crypto';
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole, staleBearerFor } from '@tests/http';
import { createUser, createAdminUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { signWebhookPayload, WEBHOOK_SIGNATURE_HEADER } from '@modules/payments/providers';
import { paymentRepository } from '@modules/payments/repository';
import { inventoryService } from '@modules/inventory';
import { setFakeOutcome } from '@scenarios/support/doubles/payments/fake';
import { onDomainEvent } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import { ORDER_STATUS_CHANGED } from '@modules/orders';
import { MISSING_ID } from '@tests/ids';
import { setEnvironment } from '@tests/environment';
import { transferOrder as openTransferOrder } from '../factories';

setupTestDb();

// Literals, not imported from the fake PSP's file — a contract test's inputs come from what the
// provider's own documentation publishes (`pm_card_visa` succeeds, `pm_card_declined` is refused),
// not from the code the contract describes. Importing the double would make a rename of either
// value pass silently while this test quietly stopped meaning anything.
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
        .post('/payments')
        .set('Authorization', bearer)
        .send({ orderId: String(order._id) });

    if (response.status !== 201)
        throw new Error(
            `payments setup failed: POST /payments returned ${response.status} — ${JSON.stringify(response.body)}`
        );

    return { bearer, order, paymentId: String(response.body.id) };
};

/**
 * A pending `bank_transfer` order with its transfer payment opened, and the customer who placed
 * it — the payment carries the RF reference, as `order.created`'s listener leaves it.
 */
const transferOrderOf = async () => {
    const { user, bearer } = await authenticateAs('user');
    const { order, reference } = await openTransferOrder({ user });
    return { order, reference, customerBearer: bearer };
};

/** A customer who paid in full, over HTTP — the fixture the refund tests start from. */
const paidOrder = async () => {
    const { bearer, order, paymentId } = await authenticateWithIntent();
    const confirmed = await api()
        .post(`/payments/${paymentId}/confirm`)
        .set('Authorization', bearer)
        .send({ paymentMethodRef: GOOD_METHOD });

    if (confirmed.status !== 200 || confirmed.body?.status !== 'succeeded')
        throw new Error(
            `payments setup failed: POST /payments/${paymentId}/confirm returned ${confirmed.status} — ${JSON.stringify(confirmed.body)}`
        );

    return { bearer, order, paymentId };
};

describe('GET /payments/methods', () => {
    it('matches the contract, unauthenticated included — methods are pre-purchase information', async () => {
        const response = await api().get('/payments/methods');

        expect(response.status).toBe(200);
        expect(response.body.methods.length).toBeGreaterThan(0);
        expect(response.body.methods.map((method: { id: string }) => method.id)).toContain('card');
    });
});

/**
 * A deployment with no card payment provider: `NODE_PAYMENT_PROVIDER` unset. Nothing can take a
 * card, so nothing about cards exists: no method, no intent, no webhook route.
 */
describe('with no card payment provider configured', () => {
    beforeEach(() => {
        setEnvironment({ NODE_PAYMENT_PROVIDER: undefined });
    });

    it('GET /payments/methods does not list card', async () => {
        const response = await api().get('/payments/methods');

        expect(response.status).toBe(200);
        expect(response.body.methods.map((method: { id: string }) => method.id)).not.toContain(
            'card'
        );
    });

    it('POST /payments answers 409 PAYMENT_CARD_NOT_AVAILABLE and opens nothing', async () => {
        const { bearer, order } = await authenticateWithOrder();

        const response = await api()
            .post('/payments')
            .set('Authorization', bearer)
            .send({ orderId: String(order._id) });

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('PAYMENT_CARD_NOT_AVAILABLE');
        expect(await paymentRepository.findByOrderId(String(order._id))).toBeNull();
    });

    it('POST /payments/webhook answers 404, signed or not', async () => {
        const body = JSON.stringify({ id: 'evt_no_provider', providerRef: 'x' });

        const response = await api()
            .post('/payments/webhook')
            .set('Content-Type', 'application/json')
            .set(WEBHOOK_SIGNATURE_HEADER, signWebhookPayload(body))
            .send(body);

        expect(response.status).toBe(404);
    });
});

describe('POST /payments', () => {
    it('matches the contract for a fresh intent', async () => {
        const { bearer, order } = await authenticateWithOrder();

        const response = await api()
            .post('/payments')
            .set('Authorization', bearer)
            .send({ orderId: String(order._id) });

        expect(response.status).toBe(201);
        expect(response.body.amount).toBe(20);
        expect(response.body.status).toBe('requires_confirmation');
        // The answer is what the payment form keeps: it must say the next step is `pay`.
        expect(response.body.actions).toEqual({
            pay: true,
            sync: false,
            refund: false,
            settleByHand: []
        });
    });

    // A 201 says a payment was created (RFC 9110 §15.3.2). Asking again refreshes the one
    // row an order can have, so it answers 200 — the same payment, no second Location.
    it('answers 200 for the same intent when asked again, and 201 with a Location only the first time', async () => {
        const { bearer, order } = await authenticateWithOrder();
        const ask = () =>
            api()
                .post('/payments')
                .set('Authorization', bearer)
                .send({ orderId: String(order._id) });

        const first = await ask();
        const again = await ask();

        expect(first.status).toBe(201);
        expect(first.headers.location).toBe(`/payments/${String(first.body.id)}`);
        expect(again.status).toBe(200);
        expect(again.headers.location).toBeUndefined();
        expect(again.body.id).toBe(first.body.id);
    });

    it('never publishes the provider reference, and returns the client secret only here', async () => {
        // Two opposite rules on one response. `providerRef` operates on real money at the provider
        // and no client has an operation that needs it. `clientSecret` authorises COMPLETING this
        // payment, so it must reach the browser exactly once and be stored nowhere.
        const { bearer, order } = await authenticateWithOrder();

        const intent = await api()
            .post('/payments')
            .set('Authorization', bearer)
            .send({ orderId: String(order._id) });
        const readBack = await api()
            .get(`/payments/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(intent.body).not.toHaveProperty('providerRef');
        expect(intent.body.clientSecret).toEqual(expect.any(String));
        expect(readBack.body).not.toHaveProperty('providerRef');
        expect(readBack.body).not.toHaveProperty('clientSecret');
    });

    it('matches the error contract for an order that does not exist', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post('/payments')
            .set('Authorization', bearer)
            .send({ orderId: MISSING_ID });

        expect(response.status).toBe(404);
    });

    it('matches the error contract for an invalid body', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().post('/payments').set('Authorization', bearer).send({});

        expect(response.status).toBe(422);
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
        expect(response.body.status).toBe('succeeded');
        expect(response.body.actions).toEqual({
            pay: false,
            sync: false,
            refund: false,
            settleByHand: []
        });
    });

    it('matches the error contract for a declined card', async () => {
        const { bearer, paymentId } = await authenticateWithIntent();

        const response = await api()
            .post(`/payments/${paymentId}/confirm`)
            .set('Authorization', bearer)
            .send({ paymentMethodRef: DECLINE_METHOD });

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('PAYMENT_DECLINED');
    });

    it('matches the error contract for a payment that does not exist', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post(`/payments/${MISSING_ID}/confirm`)
            .set('Authorization', bearer)
            .send({ paymentMethodRef: GOOD_METHOD });

        expect(response.status).toBe(404);
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
        expect(response.body.status).toBe('requires_action');
        // The answer replaces the stored payment: without `sync` the Finish button would vanish.
        expect(response.body.actions).toMatchObject({ pay: false, sync: true });
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
        expect(response.body.status).toBe('succeeded');
        expect(response.body.actions).toMatchObject({ pay: false, sync: false });
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
        expect(response.body.status).toBe('succeeded');
    });

    it('matches the error contract for a payment that does not exist', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post(`/payments/${MISSING_ID}/sync`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});

/** Posts a body with the signature a provider would have sent over those exact bytes. */
const deliver = (event: unknown, signature?: string, path = '/payments/webhook') => {
    const body = JSON.stringify(event);
    return api()
        .post(path)
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

/**
 * The card steps spend a basket, so they ask `checkout:Cart`: an account whose address is not
 * proven is told to confirm it (`deniedCode`), not that it lacks permission in the abstract.
 */
describe('the card steps — who may pay', () => {
    it.each([
        ['POST /payments', '/payments'],
        ['POST /payments/{id}/confirm', `/payments/${MISSING_ID}/confirm`],
        ['POST /payments/{id}/sync', `/payments/${MISSING_ID}/sync`]
    ])('%s refuses an unverified account with EMAIL_NOT_VERIFIED', async (_step, url) => {
        const { bearer } = await authenticateAsRole('unverified');

        const response = await api().post(url).set('Authorization', bearer).send({});

        expect(response.status).toBe(403);
        expect(response.body.errors[0].code).toBe('EMAIL_NOT_VERIFIED');
    });

    // Refused first, challenged second: a caller who can never pass is not asked for a password.
    describe('with a session past the critical window', () => {
        afterEach(() => jest.useRealTimers());

        it.each([
            ['POST /payments', '/payments'],
            ['POST /payments/{id}/confirm', `/payments/${MISSING_ID}/confirm`],
            ['POST /payments/{id}/sync', `/payments/${MISSING_ID}/sync`]
        ])('%s still answers an unverified account 403 EMAIL_NOT_VERIFIED', async (_step, url) => {
            const bearer = await staleBearerFor(await createUser(), 'critical');

            const response = await api().post(url).set('Authorization', bearer).send({});

            expect(response.status).toBe(403);
            expect(response.body.errors[0].code).toBe('EMAIL_NOT_VERIFIED');
        });
    });
});

describe('POST /payments/webhook', () => {
    it('settles what the provider answers for the named intent, with no session of any kind', async () => {
        const { paymentId, providerRef } = await preparedPayment();
        // The delivery says nothing about the outcome: the provider's own answer is what lands.
        setFakeOutcome(providerRef, { status: 'succeeded', cardLast4: '4242' });

        const response = await deliver({ id: `evt_${paymentId}`, providerRef });

        expect(response.status).toBe(204);
        const settled = await paymentRepository.findById(paymentId);
        expect(settled!.status).toBe('succeeded');
    });

    it('verifies the signature over the raw body whatever the case of the path', async () => {
        // Express routes `/Payments/Webhook` to the same handler; the raw-body allowlist must match
        // it too, or the handler sees no raw body and refuses a delivery that is validly signed.
        const { paymentId, providerRef } = await preparedPayment();
        setFakeOutcome(providerRef, { status: 'succeeded', cardLast4: '4242' });

        const response = await deliver(
            { id: `evt_case_${paymentId}`, providerRef },
            undefined,
            '/Payments/Webhook'
        );

        expect(response.status).toBe(204);
        const settled = await paymentRepository.findById(paymentId);
        expect(settled!.status).toBe('succeeded');
    });

    it('does not pay an order on the strength of a delivery alone', async () => {
        // No outcome at the provider for this intent: it answers `processing`, which moves nothing.
        const { paymentId, providerRef } = await preparedPayment();

        const response = await deliver({ id: `evt_${paymentId}`, providerRef });

        expect(response.status).toBe(204);
        const untouched = await paymentRepository.findById(paymentId);
        expect(untouched!.status).not.toBe('succeeded');
    });

    it('refuses a signed delivery whose providerRef is an operator, and settles nothing', async () => {
        // `{ "$ne": null }` would match EVERY payment if it reached the lookup unparsed.
        const { paymentId } = await preparedPayment();

        const response = await deliver({ id: 'evt_operator', providerRef: { $ne: null } });

        expect(response.status).toBe(400);
        const untouched = await paymentRepository.findById(paymentId);
        expect(untouched!.status).toBe('requires_confirmation');
    });

    it('refuses a signed delivery carrying a field the contract does not name', async () => {
        const { paymentId, providerRef } = await preparedPayment();
        setFakeOutcome(providerRef, { status: 'succeeded' });

        const response = await deliver({ id: 'evt_extra', providerRef, status: 'succeeded' });

        expect(response.status).toBe(400);
        const untouched = await paymentRepository.findById(paymentId);
        expect(untouched!.status).toBe('requires_confirmation');
    });

    it('answers 204 with no body, not the payment every other route answers', async () => {
        // A deliberate shape difference: the caller is a machine with no use for the payment back.
        // This is the assertion that catches a controller change that started leaking the payment
        // into the webhook's response.
        const { providerRef } = await preparedPayment();

        const response = await deliver({ id: 'evt_envelope_shape', providerRef });

        expect(response.status).toBe(204);
        expect(response.body).toEqual({});
    });

    it('refuses a delivery nobody signed', async () => {
        const { providerRef } = await preparedPayment();

        const response = await deliver(
            { id: 'evt_forged', providerRef },
            `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`
        );

        expect(response.status).toBe(400);
    });

    it('applies a repeated delivery once', async () => {
        const { paymentId, providerRef, order } = await preparedPayment();
        setFakeOutcome(providerRef, { status: 'succeeded' });
        const event = { id: `evt_replay_${paymentId}`, providerRef };

        // What the conditional writes actually protect: `first`/`replay` alone answer 204 on both
        // branches, so a status-only assertion can never fail on a double settlement.
        const commitSpy = jest.spyOn(inventoryService, 'commitForOrder');
        const statusChanges: unknown[] = [];
        onDomainEvent(ORDER_STATUS_CHANGED, (payload) => {
            if (payload.orderId === String(order._id)) statusChanges.push(payload);
        });

        const first = await deliver(event);
        const replay = await deliver(event);
        // The status change reaches its listener through the outbox, after the response.
        await settleOutboxNudges();

        // 204 either way — a provider reads anything else as a failed delivery and retries harder.
        expect(first.status).toBe(204);
        expect(replay.status).toBe(204);

        expect(commitSpy).toHaveBeenCalledTimes(1);
        expect(statusChanges).toHaveLength(1);
        commitSpy.mockRestore();
    });

    it('accepts an event about an intent it does not know, rather than making the provider retry', async () => {
        const response = await deliver({ id: 'evt_unknown', providerRef: 'fake_pi_nobody' });

        expect(response.status).toBe(204);
    });
});

describe('GET /payments/orders/{orderId}', () => {
    it('matches the contract for the caller`s own payment', async () => {
        const { bearer, order } = await authenticateWithIntent();

        const response = await api()
            .get(`/payments/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.orderId).toBe(String(order._id));
    });

    // The instructions of a bank transfer are the payment's own, served to its buyer while it waits.
    it('serves a waiting bank transfer its instructions as nextAction', async () => {
        const { order, reference, customerBearer } = await transferOrderOf();

        const response = await api()
            .get(`/payments/orders/${String(order._id)}`)
            .set('Authorization', customerBearer);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            status: 'requires_action',
            method: 'bank_transfer',
            nextAction: { type: 'bank_transfer', reference }
        });
        expect(response.body).not.toHaveProperty('transferReference');
        expect(response.body).not.toHaveProperty('payBy');
    });

    it('matches the error contract when no intent exists yet', async () => {
        const { bearer, order } = await authenticateWithOrder();

        const response = await api()
            .get(`/payments/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});

describe('GET /payments/{id}', () => {
    it('matches the contract for the payer, and never carries the clientSecret', async () => {
        const { bearer, paymentId } = await authenticateWithIntent();

        const response = await api().get(`/payments/${paymentId}`).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(paymentId);
        expect(response.body).not.toHaveProperty('clientSecret');
    });

    it('hides another shopper`s payment behind the same 404 as a missing one', async () => {
        const { paymentId } = await authenticateWithIntent();
        const stranger = await authenticateAsRole('customer');

        const response = await api()
            .get(`/payments/${paymentId}`)
            .set('Authorization', stranger.bearer);
        const missing = await api()
            .get(`/payments/${MISSING_ID}`)
            .set('Authorization', stranger.bearer);

        expect(response.status).toBe(404);
        expect(missing.status).toBe(404);
    });

    it('lets a caller holding display:Payment read anyone`s', async () => {
        const { paymentId } = await authenticateWithIntent();
        const admin = await authenticateAs('admin');

        const response = await api()
            .get(`/payments/${paymentId}`)
            .set('Authorization', admin.bearer);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(paymentId);
    });

    it('answers 404 for an id that is not one', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/payments/not-an-id').set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});

/** A fresh `Idempotency-Key` — the refund route refuses a request without one. */
const freshKey = (): string => randomUUID();

describe('POST /payments/{id}/refunds', () => {
    it('refuses the order`s own owner — the refund is staff-only', async () => {
        // "Own order" matters here specifically: a mis-ordered guard that checked ownership before
        // admin status would let exactly this caller through, and a stranger's order would not
        // have caught it.
        const { bearer, paymentId } = await paidOrder();

        const response = await api()
            .post(`/payments/${paymentId}/refunds`)
            .set('Authorization', bearer);

        expect(response.status).toBe(403);
        // A refund never moves `status`, so the money is read from the fields that do move.
        const payment = await paymentRepository.findById(paymentId);
        expect(payment!.refunds).toHaveLength(0);
        expect(payment!.amountRefunded).toBe(0);
    });
});

describe('POST /payments/{id}/refunds — the operator', () => {
    it('answers 201 with the refund record and where it lives, and the payment reads refunded', async () => {
        const { paymentId } = await paidOrder();
        const { bearer: adminBearer } = await authenticateAs('admin');

        const response = await api()
            .post(`/payments/${paymentId}/refunds`)
            .set('Authorization', adminBearer)
            .set('Idempotency-Key', freshKey());

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ status: 'succeeded', reason: 'goodwill' });
        expect(response.headers.location).toBe(
            `/payments/${paymentId}/refunds/${String(response.body.id)}`
        );
        // The payment is read again for the running totals: `status` stays `succeeded` after a
        // refund; `displayStatus` and `amountRefunded` say how much went back.
        const reread = await api().get(`/payments/${paymentId}`).set('Authorization', adminBearer);
        expect(reread.body.status).toBe('succeeded');
        expect(reread.body.displayStatus).toBe('refunded');
        const payment = await paymentRepository.findById(paymentId);
        expect(payment!.amountRefunded).toBe(payment!.amount);
        expect(payment!.refunds).toHaveLength(1);
        expect(reread.body.actions).toEqual({
            pay: false,
            sync: false,
            refund: false,
            settleByHand: []
        });
    });

    it('is gone at the old order-keyed address', async () => {
        const { order } = await paidOrder();
        const { bearer: adminBearer } = await authenticateAs('admin');

        const response = await api()
            .post(`/payments/orders/${String(order._id)}/refund`)
            .set('Authorization', adminBearer)
            .set('Idempotency-Key', freshKey());

        expect(response.status).toBe(404);
    });

    it('matches the error contract for a second refund — money comes back once', async () => {
        const { paymentId } = await paidOrder();
        const { bearer: adminBearer } = await authenticateAs('admin');
        await api()
            .post(`/payments/${paymentId}/refunds`)
            .set('Authorization', adminBearer)
            .set('Idempotency-Key', freshKey());

        const response = await api()
            .post(`/payments/${paymentId}/refunds`)
            .set('Authorization', adminBearer)
            .set('Idempotency-Key', freshKey());

        expect(response.status).toBe(409);
    });

    it('matches the error contract for a payment nobody holds', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post(`/payments/${MISSING_ID}/refunds`)
            .set('Authorization', bearer)
            .set('Idempotency-Key', freshKey());

        expect(response.status).toBe(404);
    });

    it('refuses a refund with no Idempotency-Key, and returns nothing', async () => {
        const { paymentId } = await paidOrder();
        const { bearer: adminBearer } = await authenticateAs('admin');

        const response = await api()
            .post(`/payments/${paymentId}/refunds`)
            .set('Authorization', adminBearer);

        expect(response.status).toBe(400);
        expect(response.body.errors[0].code).toBe('IDEMPOTENCY_KEY_REQUIRED');
        const payment = await paymentRepository.findById(paymentId);
        expect(payment!.refunds).toHaveLength(0);
        expect(payment!.amountRefunded).toBe(0);
    });

    it('replays the first answer for the same key instead of refunding twice', async () => {
        const { paymentId } = await paidOrder();
        const { bearer: adminBearer } = await authenticateAs('admin');
        const key = freshKey();
        const refund = () =>
            api()
                .post(`/payments/${paymentId}/refunds`)
                .set('Authorization', adminBearer)
                .set('Idempotency-Key', key)
                .send({ amount: 5 });

        const first = await refund();
        const second = await refund();

        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(second.headers['idempotent-replay']).toBe('true');
        const payment = await paymentRepository.findById(paymentId);
        expect(payment!.refunds).toHaveLength(1);
        expect(payment!.amountRefunded).toBe(5);
    });
});

/** An operator's refund of a paid order, with the buyer's and the operator's sessions. */
const refundedPayment = async () => {
    const { bearer: buyerBearer, paymentId } = await paidOrder();
    const { bearer: adminBearer } = await authenticateAs('admin');
    const created = await api()
        .post(`/payments/${paymentId}/refunds`)
        .set('Authorization', adminBearer)
        .set('Idempotency-Key', freshKey());
    return { buyerBearer, adminBearer, paymentId, refundId: String(created.body.id) };
};

describe('GET /payments/{id}/refunds/{refundId}', () => {
    it('matches the contract for the payer and for display:Payment', async () => {
        const { buyerBearer, adminBearer, paymentId, refundId } = await refundedPayment();

        const own = await api()
            .get(`/payments/${paymentId}/refunds/${refundId}`)
            .set('Authorization', buyerBearer);
        const staff = await api()
            .get(`/payments/${paymentId}/refunds/${refundId}`)
            .set('Authorization', adminBearer);

        expect(own.status).toBe(200);
        expect(own.body).toMatchObject({ id: refundId, status: 'succeeded' });
        expect(own.body).not.toHaveProperty('providerRefundRef');
        expect(staff.status).toBe(200);
        expect(staff.body).toHaveProperty('providerRefundRef');
    });

    it('answers the same 404 for another shopper, an unknown refund and an unknown payment', async () => {
        const { paymentId, refundId } = await refundedPayment();
        const stranger = await authenticateAsRole('customer');

        const other = await api()
            .get(`/payments/${paymentId}/refunds/${refundId}`)
            .set('Authorization', stranger.bearer);
        const unknownRefund = await api()
            .get(`/payments/${paymentId}/refunds/${MISSING_ID}`)
            .set('Authorization', stranger.bearer);
        const unknownPayment = await api()
            .get(`/payments/${MISSING_ID}/refunds/${refundId}`)
            .set('Authorization', stranger.bearer);

        expect([other.status, unknownRefund.status, unknownPayment.status]).toEqual([
            404, 404, 404
        ]);
    });

    it('answers 401 without a session', async () => {
        const { paymentId, refundId } = await refundedPayment();

        const response = await api().get(`/payments/${paymentId}/refunds/${refundId}`);

        expect(response.status).toBe(401);
    });
});

/**
 * `create:Refund` and `create:Payment` carry `stepUp: critical` on the key, so the demand is the
 * kernel's, not the route's: it is only seen by sending a stale-but-usable session through the
 * real mount. A stolen access token is what this stops.
 */
/** A cash-paid order with its refund opened by an operator and left `pending`. */
const cashRefundOwed = async () => {
    const { bearer: adminBearer, user: admin } = await authenticateAs('admin');
    const { bearer: buyerBearer, order } = await authenticateWithOrder();
    const recorded = await api()
        .post(`/orders/${String(order._id)}/payments`)
        .set('Authorization', adminBearer)
        .send({ method: 'cash', reference: 'till-settle' });
    const paymentId = String(recorded.body.id);
    await api()
        .post(`/payments/${paymentId}/refunds`)
        .set('Authorization', adminBearer)
        .set('Idempotency-Key', freshKey());
    // The refund answers with its own record; the payment is read for what the tests pin on it.
    const refunded = await api().get(`/payments/${paymentId}`).set('Authorization', adminBearer);
    return { admin, adminBearer, buyerBearer, order, paymentId, refunded: refunded.body };
};

describe('POST /payments/{id}/refunds/{refundId}/settle', () => {
    it('leaves the refund pending and offers it to settle, then confirms it by hand', async () => {
        const { adminBearer, paymentId, refunded } = await cashRefundOwed();

        // The operator refund of a cash payment only opens the record.
        expect(refunded.refundedByHand).toBeUndefined();
        expect(refunded.refunds[0].status).toBe('pending');
        expect(refunded.actions).toMatchObject({ refund: false });
        expect(refunded.actions.settleByHand).toEqual([refunded.refunds[0].id]);

        const response = await api()
            .post(`/payments/${paymentId}/refunds/${String(refunded.refunds[0].id)}/settle`)
            .set('Authorization', adminBearer);

        expect(response.status).toBe(200);
        expect(response.body.refundedByHand).toBe(true);
        expect(response.body.refunds[0].status).toBe('succeeded');
        expect(response.body.displayStatus).toBe('refunded');
        expect(response.body.actions.settleByHand).toEqual([]);
    });

    it('answers 409 PAYMENT_REFUND_NOT_OPEN to the second operator', async () => {
        const { adminBearer, paymentId, refunded } = await cashRefundOwed();
        const path = `/payments/${paymentId}/refunds/${String(refunded.refunds[0].id)}/settle`;
        await api().post(path).set('Authorization', adminBearer);

        const response = await api().post(path).set('Authorization', adminBearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('PAYMENT_REFUND_NOT_OPEN');
    });

    it('answers 404 for a refund the payment does not carry, and for a payment that does not exist', async () => {
        const { adminBearer, paymentId } = await cashRefundOwed();

        const noRefund = await api()
            .post(`/payments/${paymentId}/refunds/${MISSING_ID}/settle`)
            .set('Authorization', adminBearer);
        const noPayment = await api()
            .post(`/payments/${MISSING_ID}/refunds/${MISSING_ID}/settle`)
            .set('Authorization', adminBearer);

        expect(noRefund.status).toBe(404);
        expect(noPayment.status).toBe(404);
    });

    it('refuses the buyer: only an operator holding create:Refund may say money went back', async () => {
        const { paymentId, refunded, buyerBearer } = await cashRefundOwed();

        const response = await api()
            .post(`/payments/${paymentId}/refunds/${String(refunded.refunds[0].id)}/settle`)
            .set('Authorization', buyerBearer);

        expect(response.status).toBe(403);
    });

    it('answers a stale session 401 REAUTH_REQUIRED and settles nothing', async () => {
        const { admin, paymentId, refunded } = await cashRefundOwed();
        const bearer = await staleBearerFor(admin, 'critical');

        const response = await api()
            .post(`/payments/${paymentId}/refunds/${String(refunded.refunds[0].id)}/settle`)
            .set('Authorization', bearer);

        expect(response.status).toBe(401);
        expect(response.body.errors[0].code).toBe('REAUTH_REQUIRED');
        const payment = await paymentRepository.findById(paymentId);
        expect(payment!.refunds[0].status).toBe('pending');
    });
});

describe('the money doors ask a fresh session of an operator', () => {
    afterEach(() => jest.useRealTimers());

    it('answers a stale refund 401 REAUTH_REQUIRED and returns nothing', async () => {
        const { paymentId } = await paidOrder();
        const bearer = await staleBearerFor(
            await createAdminUser({ verifiedAt: new Date() }),
            'critical'
        );

        const response = await api()
            .post(`/payments/${paymentId}/refunds`)
            .set('Authorization', bearer)
            .set('Idempotency-Key', freshKey());

        expect(response.status).toBe(401);
        expect(response.body.errors[0].code).toBe('REAUTH_REQUIRED');
        const payment = await paymentRepository.findById(paymentId);
        expect(payment!.refunds).toHaveLength(0);
    });

    it('answers a stale hand-recorded payment 401 REAUTH_REQUIRED and records nothing', async () => {
        const { order } = await authenticateWithOrder();
        const bearer = await staleBearerFor(
            await createAdminUser({ verifiedAt: new Date() }),
            'critical'
        );

        const response = await api()
            .post(`/orders/${String(order._id)}/payments`)
            .set('Authorization', bearer)
            .send({ method: 'cash', reference: 'stale-till' });

        expect(response.status).toBe(401);
        expect(response.body.errors[0].code).toBe('REAUTH_REQUIRED');
        expect(await paymentRepository.findByOrderId(String(order._id))).toBeNull();
    });
});

describe('POST /orders/{id}/payments', () => {
    it('matches the contract for recording money by hand', async () => {
        const { bearer: adminBearer } = await authenticateAs('admin');
        const { order } = await authenticateWithOrder();

        const response = await api()
            .post(`/orders/${String(order._id)}/payments`)
            .set('Authorization', adminBearer)
            .send({ method: 'cash', reference: 'till-1' });

        expect(response.status).toBe(201);
        expect(response.headers.location).toBe(`/payments/${String(response.body.id)}`);
        expect(response.body.status).toBe('succeeded');
        expect(response.body.provider).toBe('manual');
        expect(response.body.method).toBe('cash');
        // A succeeded payment answers `actions` without an order read: `pay` is false regardless.
        expect(response.body.actions).toEqual({
            pay: false,
            sync: false,
            refund: true,
            settleByHand: []
        });
    });

    // The row of a card intent nobody paid is converted, not inserted, so nothing was created.
    it('answers 200 when it converts the row of an unpaid card intent', async () => {
        const { bearer: adminBearer } = await authenticateAs('admin');
        const { bearer, order } = await authenticateWithOrder();
        await api()
            .post('/payments')
            .set('Authorization', bearer)
            .send({ orderId: String(order._id) });

        const response = await api()
            .post(`/orders/${String(order._id)}/payments`)
            .set('Authorization', adminBearer)
            .send({ method: 'cash', reference: 'till-2' });

        expect(response.status).toBe(200);
        expect(response.headers.location).toBeUndefined();
        expect(response.body.status).toBe('succeeded');
        expect(response.body.provider).toBe('manual');
    });

    it('matches the error contract for an order that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post(`/orders/${MISSING_ID}/payments`)
            .set('Authorization', bearer)
            .send({ method: 'cash' });

        expect(response.status).toBe(404);
    });

    it('matches the error contract for a method the contract does not allow', async () => {
        const { bearer } = await authenticateAs('admin');
        const { order } = await authenticateWithOrder();

        const response = await api()
            .post(`/orders/${String(order._id)}/payments`)
            .set('Authorization', bearer)
            .send({ method: 'crypto' });

        expect(response.status).toBe(422);
    });

    it('matches the error contract for an order already paid', async () => {
        const { bearer } = await authenticateAs('admin');
        const { order } = await authenticateWithOrder();
        await api()
            .post(`/orders/${String(order._id)}/payments`)
            .set('Authorization', bearer)
            .send({ method: 'cash' });

        const response = await api()
            .post(`/orders/${String(order._id)}/payments`)
            .set('Authorization', bearer)
            .send({ method: 'cash' });

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
    });
});

describe('GET /payments?transferReference=', () => {
    it('matches the contract for the payment a reference names, spaced and lowercase included', async () => {
        const { bearer } = await authenticateAs('admin');
        const { order, reference } = await transferOrderOf();
        const typed = reference.replaceAll(/(.{4})/g, '$1 ').toLowerCase();

        const response = await api()
            .get('/payments')
            .query({ transferReference: typed })
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items.map((row: { orderId: string }) => row.orderId)).toEqual([
            String(order._id)
        ]);
    });

    it('answers an empty list for a reference that fails its check digits', async () => {
        const { bearer } = await authenticateAs('admin');
        const { reference } = await transferOrderOf();
        const lastChar = reference.at(-1)!;
        const typo = `${reference.slice(0, -1)}${lastChar === '0' ? '1' : '0'}`;

        const response = await api()
            .get('/payments')
            .query({ transferReference: typo })
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toEqual([]);
    });

    it('answers the same for POST /payments/search', async () => {
        const { bearer } = await authenticateAs('admin');
        const { order, reference } = await transferOrderOf();

        const response = await api()
            .post('/payments/search')
            .set('Authorization', bearer)
            .send({ transferReference: reference });

        expect(response.status).toBe(200);
        expect(response.body.items.map((row: { orderId: string }) => row.orderId)).toEqual([
            String(order._id)
        ]);
    });

    it('refuses a caller without display:Payment', async () => {
        const { reference } = await transferOrderOf();
        const { bearer } = await authenticateAsRole('customer');

        const response = await api()
            .get('/payments')
            .query({ transferReference: reference })
            .set('Authorization', bearer);

        expect(response.status).toBe(403);
    });

    it('is gone at the old lookup address', async () => {
        const { bearer } = await authenticateAs('admin');
        const { reference } = await transferOrderOf();

        const response = await api()
            .get('/payments/order-by-reference')
            .query({ ref: reference })
            .set('Authorization', bearer);

        // `/payments/{id}` now answers the segment, as a payment id that is not one.
        expect(response.status).toBe(404);
    });
});

describe('the staff Payments page', () => {
    it('GET /payments matches the contract for staff, and carries the provider reference', async () => {
        const { order } = await paidOrder();
        const { bearer: adminBearer } = await authenticateAs('admin');

        const response = await api()
            .get('/payments?displayStatus=succeeded&sort=-amount&amountMin=1')
            .set('Authorization', adminBearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(1);
        expect(response.body.items[0]).toMatchObject({
            orderId: String(order._id),
            displayStatus: 'succeeded',
            providerRef: expect.any(String) as string,
            orderNumber: order.orderNumber
        });
    });

    it('GET /payments?sort=payBy orders awaiting transfers by deadline, either way', async () => {
        const { payment: later } = await openTransferOrder({
            user: await createUser({ email: 'later@example.com' }),
            holdHours: 72
        });
        const { payment: sooner } = await openTransferOrder({
            user: await createUser({ email: 'sooner@example.com' }),
            holdHours: 5
        });
        const { bearer } = await authenticateAs('admin');
        const ids = (sort: string) =>
            api()
                .get(`/payments?method=bank_transfer&displayStatus=incomplete&sort=${sort}`)
                .set('Authorization', bearer)
                .then((response) => {
                    expect(response.status).toBe(200);
                    return (response.body.items as { id: string }[]).map((row) => row.id);
                });

        expect(await ids('payBy')).toEqual([String(sooner._id), String(later._id)]);
        expect(await ids('-payBy')).toEqual([String(later._id), String(sooner._id)]);
    });

    it('POST /payments/search answers what GET /payments does', async () => {
        await paidOrder();
        const { bearer: adminBearer } = await authenticateAs('admin');

        const response = await api()
            .post('/payments/search')
            .set('Authorization', adminBearer)
            .send({ displayStatus: 'succeeded', amountMin: 1 });

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(1);
    });

    it('refuses a customer all four reads', async () => {
        const { bearer } = await authenticateWithOrder();

        const responses = await Promise.all([
            api().get('/payments').set('Authorization', bearer),
            api().post('/payments/search').set('Authorization', bearer).send({}),
            api().get('/payments/refunds').set('Authorization', bearer),
            api().get('/payments/attention').set('Authorization', bearer)
        ]);

        expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403]);
    });

    it('answers 422 for a status that is not a label', async () => {
        const { bearer: adminBearer } = await authenticateAs('admin');

        const response = await api()
            .get('/payments?displayStatus=paid')
            .set('Authorization', adminBearer);

        expect(response.status).toBe(422);
    });

    it('GET /payments/refunds lists a refund once an operator has made one', async () => {
        const { order, paymentId } = await paidOrder();
        const { bearer: adminBearer } = await authenticateAs('admin');
        await api()
            .post(`/payments/${paymentId}/refunds`)
            .set('Authorization', adminBearer)
            .set('Idempotency-Key', freshKey());

        const response = await api().get('/payments/refunds').set('Authorization', adminBearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toEqual([
            expect.objectContaining({
                orderId: String(order._id),
                status: 'succeeded',
                reason: 'goodwill',
                providerRefundRef: expect.any(String) as string
            })
        ]);
    });

    it('GET /payments/attention matches the contract, empty when nothing is stuck', async () => {
        const { bearer: adminBearer } = await authenticateAs('admin');

        const response = await api().get('/payments/attention').set('Authorization', adminBearer);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ items: [] });
    });
});
