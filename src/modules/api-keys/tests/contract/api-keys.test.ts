/**
 * @module
 * Contract tests for the `/api-keys` admin surface: list, mint, revoke — against the bundled
 * `openapi.yaml`. Every route requires a human session (`bearerAuth`); the credentials THIS module
 * mints are exercised against OTHER routes in `tests/cross-cutting/`, not here.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAsRole } from '@tests/http';
import { ensureTenant, DEPLOYMENT_TENANT_SLUG } from '@modules/access';
import { freezeDate, advanceDate } from '@tests/clock';
import { REAUTH_TIME_CRITICAL } from '@kernel/middlewares/authorizations';

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
    await ensureTenant(DEPLOYMENT_TENANT_SLUG, 'Contract test shop');
});

describe('GET /api-keys', () => {
    it('401s an unauthenticated request', async () => {
        const response = await api().get('/api-keys');

        expect(response.status).toBe(401);
    });

    it('403s a role holding no apikeys key at all', async () => {
        const { bearer } = await authenticateAsRole('customer');

        const response = await api().get('/api-keys').set('Authorization', bearer);

        expect(response.status).toBe(403);
    });

    it('lists an owner’s own credentials, never a secret', async () => {
        const { bearer } = await authenticateAsRole('admin');
        await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({
                name: 'partner integration',
                permissions: ['orders.self.read'],
                expiresAt: IN_A_WEEK()
            });

        const response = await api().get('/api-keys').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items.length).toBeGreaterThan(0);
        for (const item of response.body.data.items) {
            expect(item.secret).toBeUndefined();
        }
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
                permissions: ['orders.self.read'],
                expiresAt: IN_A_WEEK()
            });

        expect(response.status).toBe(201);
        expect(typeof response.body.data.secret).toBe('string');
        expect(response.body.data.secret.startsWith('sk_')).toBe(true);
        expect(response.body.data.permissions).toEqual(['orders.self.read']);
    });

    it('answers no-store: the one-time secret is never kept by a cache', async () => {
        const { bearer } = await authenticateAsRole('admin');

        const response = await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({
                name: 'partner integration',
                permissions: ['orders.self.read'],
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
                permissions: ['platform.observability.any.read'],
                expiresAt: IN_A_WEEK()
            });

        expect(response.status).toBe(422);
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
        advanceDate((REAUTH_TIME_CRITICAL + 1) * 1000);

        const response = await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({
                name: 'partner integration',
                permissions: ['orders.self.read'],
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
            .send({ name: 'forever', permissions: ['orders.self.read'] });

        expect(response.status).toBe(422);
    });

    it('422s an expiry more than a year ahead, and accepts one a little under', async () => {
        const { bearer } = await authenticateAsRole('admin');
        const mint = (expiresAt: string) =>
            api()
                .post('/api-keys')
                .set('Authorization', bearer)
                .send({ name: 'bounded', permissions: ['orders.self.read'], expiresAt });

        const tooFar = await mint(ahead(367));
        const fine = await mint(ahead(360));

        expect(tooFar.status).toBe(422);
        expect(fine.status).toBe(201);
    });

    it('403s a role holding no apikeys key at all', async () => {
        const { bearer } = await authenticateAsRole('customer');

        const response = await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({
                name: 'partner integration',
                permissions: ['orders.self.read'],
                expiresAt: IN_A_WEEK()
            });

        expect(response.status).toBe(403);
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
                permissions: ['orders.self.read'],
                expiresAt: IN_A_WEEK()
            });

        const response = await api()
            .delete(`/api-keys/${String(created.body.data.id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('404s an id from outside this admin’s reach', async () => {
        const { bearer } = await authenticateAsRole('admin');

        const response = await api()
            .delete('/api-keys/000000000000000000000000')
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});
