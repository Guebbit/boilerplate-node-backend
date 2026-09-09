/**
 * @module
 * Contract tests for the `/webhooks` admin surface: subscriptions CRUD, the delivery log, replay,
 * and the public event catalogue — against the bundled `openapi.yaml`.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAsRole } from '@tests/http';
import { ensureTenant } from '@kernel/access/store';
import { DEMO_TENANT_SLUG } from '@kernel/access/seed';

setupTestDb();

/**
 * A subscription's `tenant` field is `context.caller.tenantId` (see `services/context.ts`), which
 * a real login only resolves once the deployment's shop exists — `resolveDeploymentTenantId`
 * caches `null` ("no shop") the first time it is asked otherwise, for the rest of this file. A
 * real deployment always has this from `npm run db:seed`'s `seedAccessModel()`; this suite has to
 * do the same, after `setupTestDb()`'s own `clearAll` (registered first) wipes it every test.
 */
beforeEach(async () => {
    await ensureTenant(DEMO_TENANT_SLUG, 'Contract test shop');
});

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
        expect(response).toSatisfyApiSpec();
    });

    it('403s a role holding neither webhooks.read nor webhooks.manage', async () => {
        const { bearer } = await authenticateAsRole('customer');

        const response = await api().get('/webhooks/subscriptions').set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
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
        expect(response).toSatisfyApiSpec();
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
        expect(response).toSatisfyApiSpec();
    });

    it('422s a plain http:// url', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody({ url: 'http://example.test/inbox' }));

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('422s an empty eventTypes list', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody({ eventTypes: [] }));

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('403s a role holding only webhooks.read', async () => {
        // No preset role holds webhooks.read without webhooks.manage today, so this asserts the
        // negative the other way: a role with NEITHER key is refused on the write route too.
        const { bearer } = await authenticateAsRole('customer');

        const response = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
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
            expect(second).toSatisfyApiSpec();
        } finally {
            if (originalCap === undefined) delete process.env.NODE_WEBHOOK_SUBSCRIPTION_CAP;
            else process.env.NODE_WEBHOOK_SUBSCRIPTION_CAP = originalCap;
        }
    });
});

describe('PATCH /webhooks/subscriptions/:id', () => {
    it('rotates the secret ring, returning newSecret and leaving the old one active too', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());

        const response = await api()
            .patch(`/webhooks/subscriptions/${String(created.body.data.id)}`)
            .set('Authorization', bearer)
            .send({ rotateSecret: true });

        expect(response.status).toBe(200);
        expect(typeof response.body.data.newSecret).toBe('string');
        expect(response.body.data.secretIds).toHaveLength(2);
        expect(response).toSatisfyApiSpec();
    });

    it('422s a removeSecretId that would empty the ring', async () => {
        const { bearer } = await authenticateAsRole('manager');
        const created = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send(subscriptionBody());
        const [onlySecretId] = created.body.data.secretIds as string[];

        const response = await api()
            .patch(`/webhooks/subscriptions/${String(created.body.data.id)}`)
            .set('Authorization', bearer)
            .send({ removeSecretId: onlySecretId });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('404s an id from outside this admin’s reach', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .patch('/webhooks/subscriptions/000000000000000000000000')
            .set('Authorization', bearer)
            .send({ enabled: false });

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
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
        expect(response).toSatisfyApiSpec();

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
        expect(response).toSatisfyApiSpec();
    });

    it('answers an empty page when nothing has been delivered yet', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api().get('/webhooks/deliveries').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([]);
        expect(response).toSatisfyApiSpec();
    });

    it('422s an unrecognised status filter', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .get('/webhooks/deliveries?status=not-a-real-status')
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /webhooks/deliveries/:id/replay', () => {
    it('404s a delivery id that does not exist', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .post('/webhooks/deliveries/000000000000000000000000/replay')
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });
});

describe('GET /webhooks/events', () => {
    it('serves the six-event public catalogue', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api().get('/webhooks/events').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(
            (response.body.data as { name: string }[]).map((event) => event.name).toSorted()
        ).toEqual(
            [
                'order.cancelled',
                'order.created',
                'order.paid',
                'order.shipped',
                'payment.failed',
                'payment.succeeded'
            ].toSorted()
        );
        expect(response).toSatisfyApiSpec();
    });

    it('401s an unauthenticated request', async () => {
        const response = await api().get('/webhooks/events');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});
