/**
 * `src/app/demo.ts`'s `restoreScenario` for the `blank` scenario — harness infrastructure only,
 * against a real database. Exercised as a function call rather than over HTTP: `installDemo`'s
 * route is a thin wrapper around this, gated behind `NODE_DEMO` at import time, which this suite
 * has no reason to flip.
 *
 * Two cases below drive a restored database over real HTTP instead — the two defects
 * `emptyDatabase()` and the pinned `DEMO_TENANT_ID` exist to close, proven against the thing that
 * broke (an index, a cached tenant id) rather than against the helper's own internals.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { restoreScenario } from '@app/demo';
import { PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { userModel } from '@modules/users/model';
import { productModel } from '@modules/products/model';
import { orderModel } from '@modules/orders/model';
import { localeModel } from '@modules/locales/model';
import { roleModel } from '@kernel/access/models';
import { DEMO_TENANT_ID } from '@kernel/access/seed';

setupTestDb();

describe('the `blank` scenario', () => {
    it('seeds only the four named accounts, roles and locales — no shop data', async () => {
        await restoreScenario(false, 'blank');

        await expect(userModel.countDocuments()).resolves.toBe(4);
        await expect(roleModel.countDocuments()).resolves.toBeGreaterThan(0);
        await expect(localeModel.countDocuments()).resolves.toBeGreaterThan(0);
        await expect(productModel.countDocuments()).resolves.toBe(0);
        await expect(orderModel.countDocuments()).resolves.toBe(0);
    });
});

describe('a restore never loses an index', () => {
    it('still refuses a duplicate signup after a restore, with the same 409', async () => {
        // `emptyDatabase()` — never `dropDatabase()` — is what this asserts: a drop clears each
        // model's index build along with the data, so `users_email`'s unique index would be gone
        // here and the second signup would insert instead of refusing.
        await restoreScenario(true, 'blank');

        const email = 'twice@example.com';
        await api().post('/account/signup').send({
            email,
            username: 'first',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        });

        const second = await api().post('/account/signup').send({
            email,
            username: 'second',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        });

        expect(second.status).toBe(409);
        await expect(userModel.countDocuments({ email })).resolves.toBe(1);
    });
});

describe('a restore never strands the tenant cache', () => {
    it('GET /account/abilities publishes the tenant id the database holds', async () => {
        // Twice, not once: the cache in `resolveDeploymentTenantId` is process-lifetime, so the
        // property under test is that a SECOND restore still agrees with it, not that the first
        // one happened to populate it correctly.
        await restoreScenario(true, 'blank');
        await restoreScenario(true, 'blank');

        const { bearer } = await authenticateAs('owner');
        const response = await api().get('/account/abilities').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.tenantId).toBe(DEMO_TENANT_ID);
    });
});
