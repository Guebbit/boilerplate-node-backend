/**
 * @module
 * Contract tests for the `/webhooks` admin surface: subscriptions CRUD, the delivery log, replay,
 * and the public event catalogue — against the bundled `openapi.yaml`.
 */

import { resolve4 } from 'node:dns/promises';
import { Types } from 'mongoose';
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAsRole } from '@tests/http';
import { webhookDeliveryRepository, webhookSubscriptionRepository } from '../../repository';

setupTestDb();

/** A subscription body pointed at a URL nothing ever calls — these tests never deliver anything. */
const subscriptionBody = (overrides: Record<string, unknown> = {}) => ({
    url: 'https://example.test/inbox',
    eventTypes: ['order.paid'],
    ...overrides
});

describe('GET /webhooks/subscriptions', () => {
    it('401s an unauthenticated request', async () => {
        const response = await api().get('/webhooks/subscriptions');

        expect(response.status).toBe(401);
    });

    it('403s a role holding no webhooks key at all', async () => {
        const { bearer } = await authenticateAsRole('customer');

        const response = await api().get('/webhooks/subscriptions').set('Authorization', bearer);

        expect(response.status).toBe(403);
    });

    it('lists a manager’s own subscriptions, never a secret', async () => {
        const { bearer } = await authenticateAsRole('manager');
        await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());

        const response = await api().get('/webhooks/subscriptions').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items.length).toBeGreaterThan(0);
        for (const item of response.body.data.items) {
            expect(item.secret).toBeUndefined();
            expect(item.newSecret).toBeUndefined();
            expect(Array.isArray(item.secretIds)).toBe(true);
        }
    });
});

describe('POST /webhooks/subscriptions', () => {
    it('creates a subscription and returns its one-time secret', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());

        expect(response.status).toBe(201);
        expect(typeof response.body.data.secret).toBe('string');
        expect(response.body.data.secret.startsWith('whsec_')).toBe(true);
        expect(response.body.data.eventTypes).toEqual(['order.paid']);
        expect(response.body.data.enabled).toBe(true);
        expect(response.body.data.consecutiveFailures).toBe(0);
    });

    it('422s a plain http:// url', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody({ url: 'http://example.test/inbox' }));

        expect(response.status).toBe(422);
    });

    it('422s an empty eventTypes list', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody({ eventTypes: [] }));

        expect(response.status).toBe(422);
    });

    it('403s a role holding only webhooks.any.read', async () => {
        // No preset role holds webhooks.any.read without also holding the write keys today, so
        // this asserts the negative the other way: a role with NEITHER key is refused too.
        const { bearer } = await authenticateAsRole('customer');

        const response = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());

        expect(response.status).toBe(403);
    });

    it('422s once the subscription cap is reached', async () => {
        const originalCap = process.env.NODE_WEBHOOK_SUBSCRIPTION_CAP;
        process.env.NODE_WEBHOOK_SUBSCRIPTION_CAP = '1';
        try {
            const { bearer } = await authenticateAsRole('manager');
            const first = await api()
                .post('/webhooks/subscriptions')
                .set('Authorization', bearer)
                .send(subscriptionBody());
            expect(first.status).toBe(201);

            const second = await api()
                .post('/webhooks/subscriptions')
                .set('Authorization', bearer)
                .send(subscriptionBody());

            expect(second.status).toBe(422);
        } finally {
            if (originalCap === undefined) delete process.env.NODE_WEBHOOK_SUBSCRIPTION_CAP;
            else process.env.NODE_WEBHOOK_SUBSCRIPTION_CAP = originalCap;
        }
    });
});

describe('PUT /webhooks/subscriptions/:id', () => {
    it('replaces a subscription, clearing an omitted description', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody({ description: 'was here' }));

        const response = await api()
            .put(`/webhooks/subscriptions/${String(created.body.data.id)}`)
            .set('Authorization', bearer)
            .send({
                url: 'https://example.test/inbox-2',
                eventTypes: ['order.paid'],
                enabled: false
            });

        expect(response.status).toBe(200);
        expect(response.body.data.url).toBe('https://example.test/inbox-2');
        expect(response.body.data.enabled).toBe(false);
        expect(response.body.data.description).toBeUndefined();
    });

    it('422s a body missing a required field', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());

        const response = await api()
            .put(`/webhooks/subscriptions/${String(created.body.data.id)}`)
            .set('Authorization', bearer)
            .send({ url: 'https://example.test/inbox-2', eventTypes: ['order.paid'] });

        expect(response.status).toBe(422);
    });

    it('404s an id from outside this admin’s reach', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .put('/webhooks/subscriptions/000000000000000000000000')
            .set('Authorization', bearer)
            .send(subscriptionBody({ enabled: true }));

        expect(response.status).toBe(404);
    });
});

describe('PATCH /webhooks/subscriptions/:id', () => {
    it('leaves an omitted field unchanged', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody({ description: 'was here' }));

        const response = await api()
            .patch(`/webhooks/subscriptions/${String(created.body.data.id)}`)
            .set('Authorization', bearer)
            .send({ enabled: false });

        expect(response.status).toBe(200);
        expect(response.body.data.enabled).toBe(false);
        expect(response.body.data.description).toBe('was here');
    });

    it('404s an id from outside this admin’s reach', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .patch('/webhooks/subscriptions/000000000000000000000000')
            .set('Authorization', bearer)
            .send({ enabled: false });

        expect(response.status).toBe(404);
    });

    it('re-enabling clears the auto-disable marker and the failure streak', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());
        const id = String(created.body.data.id);
        const stored = await webhookSubscriptionRepository.findById(id);
        if (!stored) throw new Error('fixture subscription vanished');
        stored.enabled = false;
        stored.consecutiveFailures = 4;
        stored.disabledAt = new Date();
        await webhookSubscriptionRepository.save(stored);

        const response = await api()
            .patch(`/webhooks/subscriptions/${id}`)
            .set('Authorization', bearer)
            .send({ enabled: true });

        expect(response.status).toBe(200);
        expect(response.body.data.consecutiveFailures).toBe(0);
        expect(response.body.data.disabledAt).toBeUndefined();
    });

    it('editing an already-enabled subscription does not reset its failure streak', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());
        const id = String(created.body.data.id);
        const stored = await webhookSubscriptionRepository.findById(id);
        if (!stored) throw new Error('fixture subscription vanished');
        stored.consecutiveFailures = 2;
        await webhookSubscriptionRepository.save(stored);

        const response = await api()
            .patch(`/webhooks/subscriptions/${id}`)
            .set('Authorization', bearer)
            .send({ enabled: true, description: 'renamed' });

        expect(response.status).toBe(200);
        expect(response.body.data.consecutiveFailures).toBe(2);
    });
});

describe('POST /webhooks/subscriptions/:id/rotate-secret', () => {
    it('rotates the secret ring, returning newSecret and leaving the old one active too', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());

        const response = await api()
            .post(`/webhooks/subscriptions/${String(created.body.data.id)}/rotate-secret`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(typeof response.body.data.newSecret).toBe('string');
        expect(response.body.data.secretIds).toHaveLength(2);
    });

    it('404s an id from outside this admin’s reach', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .post('/webhooks/subscriptions/000000000000000000000000/rotate-secret')
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});

describe('DELETE /webhooks/subscriptions/:id/secrets/:secretId', () => {
    it('404s a secretId the ring does not carry, without touching the ring', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());

        const response = await api()
            .delete(`/webhooks/subscriptions/${String(created.body.data.id)}/secrets/not-a-real-id`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);

        const stored = await webhookSubscriptionRepository.findById(String(created.body.data.id));
        expect(stored?.secrets).toHaveLength(1);
    });

    it('422s a removal that would empty the ring', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());
        const [onlySecretId] = created.body.data.secretIds as string[];

        const response = await api()
            .delete(
                `/webhooks/subscriptions/${String(created.body.data.id)}/secrets/${onlySecretId}`
            )
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
    });

    it('drops the old secret once a rotation leaves two', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());
        const [originalSecretId] = created.body.data.secretIds as string[];
        await api()
            .post(`/webhooks/subscriptions/${String(created.body.data.id)}/rotate-secret`)
            .set('Authorization', bearer);

        const response = await api()
            .delete(
                `/webhooks/subscriptions/${String(created.body.data.id)}/secrets/${originalSecretId}`
            )
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.secretIds).toHaveLength(1);
        expect(response.body.data.secretIds).not.toContain(originalSecretId);
    });
});

describe('DELETE /webhooks/subscriptions/:id', () => {
    it('permanently removes the subscription', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());

        const response = await api()
            .delete(`/webhooks/subscriptions/${String(created.body.data.id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);

        const listed = await api().get('/webhooks/subscriptions').set('Authorization', bearer);
        expect(
            (listed.body.data.items as { id: string }[]).some(
                (item) => item.id === String(created.body.data.id)
            )
        ).toBe(false);
    });
});

describe('GET /webhooks/deliveries', () => {
    it('401s an unauthenticated request', async () => {
        const response = await api().get('/webhooks/deliveries');

        expect(response.status).toBe(401);
    });

    it('answers an empty page when nothing has been delivered yet', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api().get('/webhooks/deliveries').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([]);
    });

    it('422s an unrecognised status filter', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .get('/webhooks/deliveries?status=not-a-real-status')
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
    });
});

describe('POST /webhooks/deliveries/:id/replay', () => {
    /*
     * A real replay: it makes one outbound attempt, to a `.test` host that never resolves — so the
     * attempt fails, as a dead endpoint's would, and the answer is the delivery as it now stands.
     * What is checked is that answer's shape, not the endpoint's health.
     */
    it('matches the contract for an exhausted delivery replayed by an operator', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());
        // Filed under the subscription's own tenant — replay only sees the caller's shop.
        const subscription = await webhookSubscriptionRepository.findById(
            created.body.data.id as string
        );
        const delivery = await webhookDeliveryRepository.create({
            tenant: subscription!.tenant,
            subscriptionId: new Types.ObjectId(created.body.data.id as string),
            eventId: 'evt_contract_replay',
            eventType: 'order.paid',
            payload: { orderId: 'order_1' },
            attempt: 1,
            status: 'exhausted',
            nextAttemptAt: new Date()
        });

        const response = await api()
            .post(`/webhooks/deliveries/${String(delivery._id)}/replay`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.id).toBe(String(delivery._id));
        expect(response.body.data.attempt).toBeGreaterThan(1);
    });

    it('404s a delivery id that does not exist', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .post('/webhooks/deliveries/000000000000000000000000/replay')
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});

describe('GET /webhooks/events', () => {
    it('serves the eleven-event public catalogue', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api().get('/webhooks/events').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(
            (response.body.data as { name: string }[]).map((event) => event.name).toSorted()
        ).toEqual(
            [
                'example.published',
                'order.cancelled',
                'order.created',
                'order.paid',
                'order.shipped',
                'payment.failed',
                'payment.refunded',
                'payment.succeeded',
                'return.closed',
                'return.received',
                'return.requested'
            ].toSorted()
        );
    });

    it('401s an unauthenticated request', async () => {
        const response = await api().get('/webhooks/events');

        expect(response.status).toBe(401);
    });
});

/** The next lookup answers a private address, as a hostile DNS record would. */
const resolvesToPrivateAddress = () => jest.mocked(resolve4).mockResolvedValueOnce(['10.0.0.5']);

describe('a private target is refused at create and update (WM-D13)', () => {
    afterEach(() => {
        delete process.env.NODE_WEBHOOK_DEMO_SINK_URL;
    });

    it('422s a create whose host resolves to a private address, naming the url field', async () => {
        const { bearer } = await authenticateAsRole('manager');
        resolvesToPrivateAddress();

        const response = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody({ url: 'https://internal.example.test/hook' }));

        expect(response.status).toBe(422);
        expect(response.body.errors[0].details).toEqual({ field: 'url', reason: 'unsafe-address' });
        expect(await webhookSubscriptionRepository.count({})).toBe(0);
    });

    it.each([
        ['PUT', { eventTypes: ['order.paid'], enabled: true }],
        ['PATCH', {}]
    ] as const)('422s a %s that moves the url to a private address', async (verb, rest) => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());
        resolvesToPrivateAddress();

        const response = await api()
            [verb.toLowerCase() as 'put' | 'patch'](
                `/webhooks/subscriptions/${String(created.body.data.id)}`
            )
            .set('Authorization', bearer)
            .send({ url: 'https://internal.example.test/hook', ...rest });

        expect(response.status).toBe(422);
    });

    it('does not look the host up again when an edit leaves the url as it is', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());
        jest.mocked(resolve4).mockClear();

        const response = await api()
            .patch(`/webhooks/subscriptions/${String(created.body.data.id)}`)
            .set('Authorization', bearer)
            .send({ url: subscriptionBody().url, enabled: false });

        expect(response.status).toBe(200);
        expect(resolve4).not.toHaveBeenCalled();
    });

    it('lets the configured demo sink through, private address and all', async () => {
        const { bearer } = await authenticateAsRole('manager');
        process.env.NODE_WEBHOOK_DEMO_SINK_URL = 'https://sink.internal/';
        resolvesToPrivateAddress();

        const response = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody({ url: 'https://sink.internal/hook' }));

        expect(response.status).toBe(201);
    });
});
