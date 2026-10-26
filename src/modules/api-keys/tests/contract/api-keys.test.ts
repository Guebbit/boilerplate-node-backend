/**
 * @module
 * Contract tests for the `/api-keys` admin surface: list, mint, revoke — against the bundled
 * `openapi.yaml`. Every route requires a human session (`bearerAuth`); the credentials THIS module
 * mints are exercised against OTHER routes in `tests/cross-cutting/`, not here.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAsRole } from '@tests/http';
import { accessService, DEPLOYMENT_TENANT_SLUG } from '@modules/access';
import { freezeDate, advanceDate } from '@tests/clock';
import { reauthWindowSeconds } from '@kernel/config';

setupTestDb();

afterEach(() => jest.useRealTimers());

/** An expiry this many days from now. */
const ahead = (days: number): string => new Date(Date.now() + days * 24 * 3_600_000).toISOString();

/** A valid expiry for a mint: a week out, well inside the one-year ceiling. */
const IN_A_WEEK = (): string => new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();

/**
 * A credential's `tenant` field is `context.caller.tenantId`, proven a `string` by
 * `TenantCallerContext`. A real login only resolves it once the deployment's shop exists — the
 * same setup `webhooks`' own contract suite needs, for the same reason. See that file's fuller
 * comment.
 */
beforeEach(async () => {
    await accessService.ensureTenant(DEPLOYMENT_TENANT_SLUG, 'Contract test shop');
});

describe('GET /api-keys', () => {
    it('lists an owner’s own credentials, never a secret', async () => {
        const { bearer } = await authenticateAsRole('admin');
        await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({
                name: 'partner integration',
                permissions: ['read:WebhookSubscription'],
                expiresAt: IN_A_WEEK()
            });

        const response = await api().get('/api-keys').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items.length).toBeGreaterThan(0);
        for (const item of response.body.items) {
            expect(item.secret).toBeUndefined();
        }
    });

    it('says what each credential is doing and the latest expiry a mint accepts', async () => {
        const { bearer } = await authenticateAsRole('admin');
        await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({
                name: 'status check',
                permissions: ['read:WebhookSubscription'],
                expiresAt: IN_A_WEEK()
            });

        const response = await api().get('/api-keys').set('Authorization', bearer);

        expect(response.body.items[0].status).toBe('active');
        expect(response.body.items[0].actions).toEqual({ revoke: true });
        expect(new Date(response.body.maxExpiresAt).getTime()).toBeGreaterThan(
            Date.now() + 364 * 24 * 3_600_000
        );
    });

    it('takes a comma-separated sort and refuses a field outside the enum', async () => {
        const { bearer } = await authenticateAsRole('admin');

        const sorted = await api()
            .get('/api-keys?sort=-lastUsedAt,expiresAt')
            .set('Authorization', bearer);
        const refused = await api().get('/api-keys?sort=name').set('Authorization', bearer);

        expect(sorted.status).toBe(200);
        expect(refused.status).toBe(422);
    });
});

/** Mints one credential and returns its id. */
const mintOne = async (bearer: string): Promise<string> => {
    const created = await api()
        .post('/api-keys')
        .set('Authorization', bearer)
        .send({
            name: 'one to read back',
            permissions: ['read:WebhookSubscription'],
            expiresAt: IN_A_WEEK()
        });
    return String(created.body.id);
};

describe('GET /api-keys/:id', () => {
    it('reads a credential back with its status, never a secret', async () => {
        const { bearer } = await authenticateAsRole('admin');
        const id = await mintOne(bearer);

        const response = await api().get(`/api-keys/${id}`).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            id,
            name: 'one to read back',
            status: 'active'
        });
        expect(response.body.secret).toBeUndefined();
    });

    it('says whether the caller may revoke it, and stops saying so once it is revoked', async () => {
        const { bearer } = await authenticateAsRole('admin');
        const id = await mintOne(bearer);

        const live = await api().get(`/api-keys/${id}`).set('Authorization', bearer);
        await api().delete(`/api-keys/${id}`).set('Authorization', bearer);
        const revoked = await api().get(`/api-keys/${id}`).set('Authorization', bearer);

        expect([live.body.actions, revoked.body.actions]).toEqual([
            { revoke: true },
            { revoke: false }
        ]);
    });

    it('answers 404 for an unknown id and a malformed one alike', async () => {
        const { bearer } = await authenticateAsRole('admin');

        const unknown = await api()
            .get('/api-keys/000000000000000000000000')
            .set('Authorization', bearer);
        const malformed = await api().get('/api-keys/not-an-id').set('Authorization', bearer);

        expect([unknown.status, malformed.status]).toEqual([404, 404]);
    });

    it('refuses a caller without read:ApiKey with 403', async () => {
        const { bearer: adminBearer } = await authenticateAsRole('admin');
        const id = await mintOne(adminBearer);
        const { bearer } = await authenticateAsRole('customer');

        const response = await api().get(`/api-keys/${id}`).set('Authorization', bearer);

        expect(response.status).toBe(403);
    });
});

describe('POST /api-keys', () => {
    it('mints a credential and returns its one-time secret', async () => {
        const { bearer } = await authenticateAsRole('admin');

        const response = await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({
                name: 'partner integration',
                permissions: ['read:WebhookSubscription'],
                expiresAt: IN_A_WEEK()
            });

        expect(response.status).toBe(201);
        expect(typeof response.body.secret).toBe('string');
        expect(response.body.secret.startsWith('sk_')).toBe(true);
        expect(response.body.permissions).toEqual(['read:WebhookSubscription']);
    });

    it('answers no-store: the one-time secret is never kept by a cache', async () => {
        const { bearer } = await authenticateAsRole('admin');

        const response = await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({
                name: 'partner integration',
                permissions: ['read:WebhookSubscription'],
                expiresAt: IN_A_WEEK()
            });

        expect(response.headers['cache-control']).toBe('no-store');
    });

    it('422s a permission the caller does not hold', async () => {
        const { bearer } = await authenticateAsRole('admin');

        // Admin is unrestricted in TENANT scope, not platform scope — this asks for a platform
        // key, which floors it exactly the way a permission it genuinely lacks would.
        const response = await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({
                name: 'over-reaching',
                permissions: ['read:ObservabilitySnapshot'],
                expiresAt: IN_A_WEEK()
            });

        expect(response.status).toBe(422);
        expect(response.body.errors[0]).toMatchObject({
            code: 'VALIDATION_ERROR',
            details: { field: 'permissions', permissions: ['read:ObservabilitySnapshot'] }
        });
    });

    it('422s an empty permissions list', async () => {
        const { bearer } = await authenticateAsRole('admin');

        const response = await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({ name: 'no permissions', permissions: [], expiresAt: IN_A_WEEK() });

        expect(response.status).toBe(422);
    });

    it('401s REAUTH_REQUIRED for a session that has not proved itself lately: a key outlives it', async () => {
        freezeDate();
        const { bearer } = await authenticateAsRole('admin');
        advanceDate((reauthWindowSeconds('critical') + 1) * 1000);

        const response = await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({
                name: 'partner integration',
                permissions: ['read:WebhookSubscription'],
                expiresAt: IN_A_WEEK()
            });

        expect(response.status).toBe(401);
        expect(response.body.errors[0].code).toBe('REAUTH_REQUIRED');
    });

    it('422s a mint with no expiry', async () => {
        const { bearer } = await authenticateAsRole('admin');

        const response = await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({ name: 'forever', permissions: ['read:WebhookSubscription'] });

        expect(response.status).toBe(422);
    });

    it('422s an expiry more than a year ahead, and accepts one a little under', async () => {
        const { bearer } = await authenticateAsRole('admin');
        const mint = (expiresAt: string) =>
            api()
                .post('/api-keys')
                .set('Authorization', bearer)
                .send({ name: 'bounded', permissions: ['read:WebhookSubscription'], expiresAt });

        const tooFar = await mint(ahead(367));
        const fine = await mint(ahead(360));

        expect(tooFar.status).toBe(422);
        expect(tooFar.body.errors[0]).toMatchObject({
            code: 'VALIDATION_ERROR',
            details: { field: 'expiresAt' }
        });
        expect(fine.status).toBe(201);
    });
});

describe('DELETE /api-keys/:id', () => {
    it('revokes a credential', async () => {
        const { bearer } = await authenticateAsRole('admin');
        const created = await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({
                name: 'short-lived',
                permissions: ['read:WebhookSubscription'],
                expiresAt: IN_A_WEEK()
            });

        const response = await api()
            .delete(`/api-keys/${String(created.body.id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(204);
    });

    it('404s an id from outside this admin’s reach', async () => {
        const { bearer } = await authenticateAsRole('admin');

        const response = await api()
            .delete('/api-keys/000000000000000000000000')
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});
