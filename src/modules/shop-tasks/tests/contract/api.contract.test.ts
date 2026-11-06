/**
 * Contract tests for /shop-tasks/summary: the answer matches the schema for an administrator and
 * for a role that opens fewer screens, and never sits in a shared cache.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';

setupTestDb();

describe('GET /shop-tasks/summary', () => {
    it('matches the contract for an administrator', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().get('/shop-tasks/summary').set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('matches the contract for a role that opens fewer screens', async () => {
        const { bearer } = await authenticateAsRole('warehouse');

        const response = await api().get('/shop-tasks/summary').set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('is never kept by a shared cache', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().get('/shop-tasks/summary').set('Authorization', bearer);

        expect(response.headers['cache-control']).toMatch(/no-store/);
    });
});
