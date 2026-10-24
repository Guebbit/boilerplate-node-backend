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
import { setEnvironment } from '@tests/environment';
import { declaredWebhookEvents } from '@tests/webhook-events';
import {
    clearSsrfExemptOrigins,
    registerSsrfExemptOrigin
} from '@infrastructure/adapters/ssrf-exemptions';

setupTestDb();

/** A subscription body pointed at a URL nothing ever calls — these tests never deliver anything. */
const subscriptionBody = (overrides: Record<string, unknown> = {}) => ({
    url: 'https://example.test/inbox',
    eventTypes: ['order.paid'],
    ...overrides
});

describe('GET /webhooks/subscriptions', () => {
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

    it('carries the caller’s actions on every row', async () => {
        const { bearer } = await authenticateAsRole('manager');
        await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());

        const response = await api().get('/webhooks/subscriptions').set('Authorization', bearer);

        expect(response.body.data.items[0].actions).toEqual({
            update: true,
            delete: true,
            enable: false,
            disable: true,
            rotateSecret: true,
            removeSecret: false
        });
    });

    it('orders by url when asked, and newest first when not', async () => {
        const { bearer } = await authenticateAsRole('manager');
        for (const path of ['b', 'a', 'c'])
            await api()
                .post('/webhooks/subscriptions')
                .set('Authorization', bearer)
                .send(subscriptionBody({ url: `https://example.test/${path}` }));

        const byUrl = await api()
            .get('/webhooks/subscriptions?sort=url')
            .set('Authorization', bearer);
        const byDefault = await api().get('/webhooks/subscriptions').set('Authorization', bearer);

        const paths = (response: typeof byUrl) =>
            (response.body.data.items as { url: string }[]).map(({ url }) => url.slice(-1));
        expect(paths(byUrl)).toEqual(['a', 'b', 'c']);
        expect(paths(byDefault)).toEqual(['c', 'a', 'b']);
    });

    it('422s a sort field the contract does not list', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .get('/webhooks/subscriptions?sort=consecutiveFailures')
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
    });
});

describe('GET /webhooks/subscriptions/:id', () => {
    it('answers one subscription with the shape the list rows carry', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());
        const id = String(created.body.data.id);

        const response = await api()
            .get(`/webhooks/subscriptions/${id}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.id).toBe(id);
        expect(response.body.data.secret).toBeUndefined();
        expect(response.body.data.actions.disable).toBe(true);
    });

    it('404s an id that matches nothing, and a malformed one alike', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const unknown = await api()
            .get('/webhooks/subscriptions/000000000000000000000000')
            .set('Authorization', bearer);
        const malformed = await api()
            .get('/webhooks/subscriptions/not-an-id')
            .set('Authorization', bearer);

        expect(unknown.status).toBe(404);
        expect(malformed.status).toBe(404);
    });

    it('404s another shop’s subscription as it would an unknown one', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const foreign = await webhookSubscriptionRepository.create({
            tenant: 'another-shop',
            url: 'https://example.test/elsewhere',
            eventTypes: ['order.paid'],
            secrets: [{ id: 's', ciphertext: 'c', createdAt: new Date() }]
        });

        const response = await api()
            .get(`/webhooks/subscriptions/${String(foreign._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('refuses a caller without the read key', async () => {
        const { bearer } = await authenticateAsRole('customer');

        const response = await api()
            .get('/webhooks/subscriptions/000000000000000000000000')
            .set('Authorization', bearer);

        expect(response.status).toBe(403);
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

    it('409s once the subscription cap is reached, with its code, and a delete lets it through', async () => {
        setEnvironment({ NODE_WEBHOOK_SUBSCRIPTION_CAP: '1' });
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

        expect(second.status).toBe(409);
        expect(second.body.errors[0].code).toBe('WEBHOOK_SUBSCRIPTION_LIMIT_REACHED');

        await api()
            .delete(`/webhooks/subscriptions/${String(first.body.data.id)}`)
            .set('Authorization', bearer);
        const third = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());
        expect(third.status).toBe(201);
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
            .send({ url: 'https://example.test/inbox-2', eventTypes: ['order.paid'] });

        expect(response.status).toBe(200);
        expect(response.body.data.url).toBe('https://example.test/inbox-2');
        expect(response.body.data.enabled).toBe(true);
        expect(response.body.data.description).toBeUndefined();
    });

    it('422s an `enabled` field: whether it is on has its own endpoints', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());

        const response = await api()
            .put(`/webhooks/subscriptions/${String(created.body.data.id)}`)
            .set('Authorization', bearer)
            .send({ ...subscriptionBody(), enabled: false });

        expect(response.status).toBe(422);
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
            .send({ url: 'https://example.test/inbox-2' });

        expect(response.status).toBe(422);
    });

    it('404s an id from outside this admin’s reach', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .put('/webhooks/subscriptions/000000000000000000000000')
            .set('Authorization', bearer)
            .send(subscriptionBody());

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
            .send({ eventTypes: ['*'] });

        expect(response.status).toBe(200);
        expect(response.body.data.eventTypes).toEqual(['*']);
        expect(response.body.data.description).toBe('was here');
    });

    it('422s an `enabled` field: whether it is on has its own endpoints', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());

        const response = await api()
            .patch(`/webhooks/subscriptions/${String(created.body.data.id)}`)
            .set('Authorization', bearer)
            .send({ enabled: false });

        expect(response.status).toBe(422);
    });

    it('404s an id from outside this admin’s reach', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .patch('/webhooks/subscriptions/000000000000000000000000')
            .set('Authorization', bearer)
            .send({ description: 'x' });

        expect(response.status).toBe(404);
    });

    it('leaves a building failure streak alone', async () => {
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
            .send({ description: 'renamed' });

        expect(response.status).toBe(200);
        expect(response.body.data.consecutiveFailures).toBe(2);
    });
});

describe('POST /webhooks/subscriptions/:id/disable and /enable', () => {
    it('pauses by hand, leaving autoDisabledAt absent, then turns it back on', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const id = await createSubscription(bearer);

        const disabled = await api()
            .post(`/webhooks/subscriptions/${id}/disable`)
            .set('Authorization', bearer);

        expect(disabled.status).toBe(200);
        expect(disabled.body.data).toMatchObject({
            enabled: false,
            actions: { enable: true, disable: false }
        });
        expect(typeof disabled.body.data.disabledAt).toBe('string');
        expect(disabled.body.data.autoDisabledAt).toBeUndefined();

        const enabled = await api()
            .post(`/webhooks/subscriptions/${id}/enable`)
            .set('Authorization', bearer);

        expect(enabled.status).toBe(200);
        expect(enabled.body.data.enabled).toBe(true);
        expect(enabled.body.data.disabledAt).toBeUndefined();
    });

    it('enabling clears the auto-disable marker and the failure streak', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const id = await createSubscription(bearer);
        const stored = await webhookSubscriptionRepository.findById(id);
        if (!stored) throw new Error('fixture subscription vanished');
        stored.consecutiveFailures = 4;
        stored.disabledAt = new Date();
        stored.autoDisabledAt = stored.disabledAt;
        await webhookSubscriptionRepository.save(stored);

        const response = await api()
            .post(`/webhooks/subscriptions/${id}/enable`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.consecutiveFailures).toBe(0);
        expect(response.body.data.disabledAt).toBeUndefined();
        expect(response.body.data.autoDisabledAt).toBeUndefined();
    });

    it('409s enabling an enabled subscription, and leaves its streak alone', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const id = await createSubscription(bearer);
        const stored = await webhookSubscriptionRepository.findById(id);
        if (!stored) throw new Error('fixture subscription vanished');
        stored.consecutiveFailures = 2;
        await webhookSubscriptionRepository.save(stored);

        const response = await api()
            .post(`/webhooks/subscriptions/${id}/enable`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('WEBHOOK_SUBSCRIPTION_ALREADY_ENABLED');
        const after = await webhookSubscriptionRepository.findById(id);
        expect(after?.consecutiveFailures).toBe(2);
    });

    it('409s disabling a disabled subscription', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const id = await createSubscription(bearer);
        await api().post(`/webhooks/subscriptions/${id}/disable`).set('Authorization', bearer);

        const response = await api()
            .post(`/webhooks/subscriptions/${id}/disable`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('WEBHOOK_SUBSCRIPTION_ALREADY_DISABLED');
    });

    it.each(['enable', 'disable'])(
        '404s %s on an id from outside this admin’s reach',
        async (verb) => {
            const { bearer } = await authenticateAsRole('manager');

            const response = await api()
                .post(`/webhooks/subscriptions/000000000000000000000000/${verb}`)
                .set('Authorization', bearer);

            expect(response.status).toBe(404);
        }
    );
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
        // The first secret keeps signing for the overlap window, and the wire says until when.
        expect(response.body.data.retiringSecrets).toEqual([
            { id: created.body.data.secretIds[0], retiresAt: expect.any(String) }
        ]);
        expect(response.body.data.actions.removeSecret).toBe(true);
        expect(created.body.data.retiringSecrets).toEqual([]);
    });

    it('keeps at most two secrets, dropping the oldest on a second rotation', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());
        const url = `/webhooks/subscriptions/${String(created.body.data.id)}/rotate-secret`;

        const first = await api().post(url).set('Authorization', bearer);
        const second = await api().post(url).set('Authorization', bearer);

        expect(second.body.data.secretIds).toHaveLength(2);
        // The oldest is gone; the one the first rotation minted survives beside the new one.
        expect(second.body.data.secretIds).toContain(first.body.data.secretIds[1]);
        expect(second.body.data.secretIds).not.toContain(first.body.data.secretIds[0]);
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
    it('answers an empty page when nothing has been delivered yet', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api().get('/webhooks/deliveries').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([]);
    });

    it('says per row whether a replay would be accepted: not while its subscription is off', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const live = await createSubscription(bearer);
        const paused = await createSubscription(bearer);
        await api().post(`/webhooks/subscriptions/${paused}/disable`).set('Authorization', bearer);
        const { tenant } = (await webhookSubscriptionRepository.findById(live))!;
        for (const subscriptionId of [live, paused])
            await webhookDeliveryRepository.create({
                tenant,
                subscriptionId: new Types.ObjectId(subscriptionId),
                eventId: `evt_${subscriptionId}`,
                eventType: 'order.paid',
                payload: {},
                attempt: 1,
                status: 'exhausted'
            });

        const response = await api().get('/webhooks/deliveries').set('Authorization', bearer);

        const replayBySubscription = Object.fromEntries(
            (
                response.body.data.items as {
                    subscriptionId: string;
                    actions: { replay: boolean };
                }[]
            ).map((row) => [row.subscriptionId, row.actions.replay])
        );
        expect(replayBySubscription).toEqual({ [live]: true, [paused]: false });
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
        expect(response.body.data.actions).toEqual({ replay: true });
    });

    it('409s while the subscription is disabled, with its code, and leaves the row alone', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const id = await createSubscription(bearer);
        const subscription = await webhookSubscriptionRepository.findById(id);
        const delivery = await webhookDeliveryRepository.create({
            tenant: subscription!.tenant,
            subscriptionId: new Types.ObjectId(id),
            eventId: 'evt_contract_replay_disabled',
            eventType: 'order.paid',
            payload: { orderId: 'order_1' },
            attempt: 1,
            status: 'exhausted'
        });
        await api().post(`/webhooks/subscriptions/${id}/disable`).set('Authorization', bearer);

        const response = await api()
            .post(`/webhooks/deliveries/${String(delivery._id)}/replay`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('WEBHOOK_SUBSCRIPTION_DISABLED');
        const stored = await webhookDeliveryRepository.findById(String(delivery._id));
        expect(stored).toMatchObject({ status: 'exhausted', attempt: 1 });
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
    it('serves the events the deployed modules declare', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api().get('/webhooks/events').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(
            (response.body.data as { name: string }[]).map((event) => event.name).toSorted()
        ).toEqual(declaredWebhookEvents());
    });
});

/** Creates a valid subscription and returns its id, for the replace and update cases. */
const createSubscription = async (bearer: string): Promise<string> => {
    const created = await api()
        .post('/webhooks/subscriptions')
        .set('Authorization', bearer)
        .send(subscriptionBody());
    return String(created.body.data.id);
};

describe('an event filter must name events the catalogue lists', () => {
    it('422s a create naming an unknown event, listing it under the eventTypes field', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody({ eventTypes: ['order.paid', 'order.payd'] }));

        expect(response.status).toBe(422);
        expect(response.body.errors[0].details).toEqual({ field: 'eventTypes' });
        expect(response.body.errors[0].message).toContain('order.payd');
        expect(await webhookSubscriptionRepository.count({})).toBe(0);
    });

    it('accepts the * wildcard, alone or beside a listed name', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody({ eventTypes: ['*', 'order.paid'] }));

        expect(response.status).toBe(201);
    });

    it.each([
        ['PUT', {}],
        ['PATCH', {}]
    ] as const)(
        '422s a %s naming an unknown event and keeps the stored filter',
        async (verb, rest) => {
            const { bearer } = await authenticateAsRole('manager');
            const id = await createSubscription(bearer);

            const response = await api()
                [verb === 'PUT' ? 'put' : 'patch'](`/webhooks/subscriptions/${id}`)
                .set('Authorization', bearer)
                .send({ ...subscriptionBody({ eventTypes: ['not.an.event'] }), ...rest });

            expect(response.status).toBe(422);
            expect(response.body.errors[0].details).toEqual({ field: 'eventTypes' });
            const stored = await webhookSubscriptionRepository.findById(id);
            expect(stored?.eventTypes).toEqual(['order.paid']);
        }
    );
});

/** The next lookup answers a private address, as a hostile DNS record would. */
const resolvesToPrivateAddress = () => jest.mocked(resolve4).mockResolvedValueOnce(['10.0.0.5']);

describe('a private target is refused at create and update', () => {
    afterEach(() => {
        clearSsrfExemptOrigins();
    });

    it('422s a create whose host resolves to a private address, naming the url field', async () => {
        const { bearer } = await authenticateAsRole('manager');
        resolvesToPrivateAddress();

        const response = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody({ url: 'https://internal.example.test/hook' }));

        expect(response.status).toBe(422);
        expect(response.body.errors[0].details).toEqual({ field: 'url' });
        expect(await webhookSubscriptionRepository.count({})).toBe(0);
    });

    it.each([
        ['PUT', { eventTypes: ['order.paid'] }],
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
            .send({ url: subscriptionBody().url, description: 'renamed' });

        expect(response.status).toBe(200);
        expect(resolve4).not.toHaveBeenCalled();
    });

    it('lets a registered exempt origin through, private address and all', async () => {
        const { bearer } = await authenticateAsRole('manager');
        registerSsrfExemptOrigin('https://sink.internal');
        resolvesToPrivateAddress();

        const response = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody({ url: 'https://sink.internal/hook' }));

        expect(response.status).toBe(201);
    });
});
