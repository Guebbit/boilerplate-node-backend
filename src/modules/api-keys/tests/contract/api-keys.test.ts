/**
 * @module
 * Contract tests for the `/api-keys` admin surface: list, mint, revoke — against the bundled
 * `openapi.yaml`. Every route requires a human session (`bearerAuth`); the credentials THIS module
 * mints are exercised against OTHER routes in `tests/cross-cutting/`, not here.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAsRole } from '@tests/http';
import { ensureTenant } from '@kernel/access/store';
import { DEPLOYMENT_TENANT_SLUG } from '@kernel/access/seed';

setupTestDb();

/**
 * A credential's `tenant` field is `context.caller.tenantId` (see `services/context.ts`), which a
 * real login only resolves once the deployment's shop exists — same setup `webhooks`' own contract
 * suite needs, for the same reason. See that file's fuller comment.
 */
beforeEach(async () => {
    await ensureTenant(DEPLOYMENT_TENANT_SLUG, 'Contract test shop');
});

describe('GET /api-keys', () => {
    it('401s an unauthenticated request', async () => {
        const response = await api().get('/api-keys');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });

    it('403s a role holding neither apikeys.read nor apikeys.manage', async () => {
        const { bearer } = await authenticateAsRole('customer');

        const response = await api().get('/api-keys').set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });

    it('lists an owner’s own credentials, never a secret', async () => {
        const { bearer } = await authenticateAsRole('owner');
        await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({ name: 'partner integration', permissions: ['orders.read'] });

        const response = await api().get('/api-keys').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items.length).toBeGreaterThan(0);
        for (const item of response.body.data.items) {
            expect(item.secret).toBeUndefined();
        }
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /api-keys', () => {
    it('mints a credential and returns its one-time secret', async () => {
        const { bearer } = await authenticateAsRole('owner');

        const response = await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({ name: 'partner integration', permissions: ['orders.read'] });

        expect(response.status).toBe(201);
        expect(typeof response.body.data.secret).toBe('string');
        expect(response.body.data.secret.startsWith('sk_')).toBe(true);
        expect(response.body.data.permissions).toEqual(['orders.read']);
        expect(response).toSatisfyApiSpec();
    });

    it('422s a permission the caller does not hold', async () => {
        const { bearer } = await authenticateAsRole('owner');

        // Owner is unrestricted in TENANT scope, not platform scope — this asks for a platform
        // key, which floors it exactly the way a permission it genuinely lacks would.
        const response = await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({ name: 'over-reaching', permissions: ['platform.observability.read'] });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('422s an empty permissions list', async () => {
        const { bearer } = await authenticateAsRole('owner');

        const response = await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({ name: 'no permissions', permissions: [] });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('403s a role holding neither apikeys.read nor apikeys.manage', async () => {
        const { bearer } = await authenticateAsRole('customer');

        const response = await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({ name: 'partner integration', permissions: ['orders.read'] });

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});

describe('DELETE /api-keys/:id', () => {
    it('revokes a credential', async () => {
        const { bearer } = await authenticateAsRole('owner');
        const created = await api()
            .post('/api-keys')
            .set('Authorization', bearer)
            .send({ name: 'short-lived', permissions: ['orders.read'] });

        const response = await api()
            .delete(`/api-keys/${String(created.body.data.id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('404s an id from outside this admin’s reach', async () => {
        const { bearer } = await authenticateAsRole('owner');

        const response = await api()
            .delete('/api-keys/000000000000000000000000')
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });
});
