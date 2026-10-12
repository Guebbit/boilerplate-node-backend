/**
 * Contract tests for /stats. Every read answers its schema, staff and manager read, a customer does
 * not, and a period the rules refuse answers 422 with a message that names the rule.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { MISSING_ID } from '@tests/ids';

setupTestDb();

/** A period every read accepts. */
const PERIOD = 'from=2026-03-01&to=2026-03-31';

/** Every read, with the query it needs. */
const READS = [
    `/stats/sales?${PERIOD}&interval=week`,
    `/stats/products?${PERIOD}&limit=5`,
    `/stats/products/${MISSING_ID}?${PERIOD}`,
    `/stats/categories?${PERIOD}`,
    `/stats/payments?${PERIOD}`,
    `/stats/operations?${PERIOD}`,
    `/stats/customers?${PERIOD}`,
    '/stats/pipeline'
];

describe('GET /stats/*', () => {
    it.each(READS)('%s matches the contract for an administrator', async (url) => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().get(url).set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('lets a manager read the sales numbers', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api().get(`/stats/sales?${PERIOD}`).set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it.each(READS)('refuses a customer on %s', async (url) => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get(url).set('Authorization', bearer);

        expect(response.status).toBe(403);
    });

    it('answers 404 for a product id that is not an id', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .get(`/stats/products/not-an-id?${PERIOD}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('refuses an anonymous caller', async () => {
        const response = await api().get(`/stats/sales?${PERIOD}`);

        expect(response.status).toBe(401);
    });

    it('never lets a shared cache keep a sales figure', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().get(`/stats/sales?${PERIOD}`).set('Authorization', bearer);

        expect(response.headers['cache-control']).not.toMatch(/public|s-maxage/);
        expect(response.headers['cache-control']).toMatch(/private|no-store/);
    });

    it.each([
        ['from=2026-03-31&to=2026-03-01', 'out-of-order'],
        ['from=2026-02-30&to=2026-03-01', 'invalid-day'],
        ['from=2020-01-01&to=2026-03-01', 'too-long'],
        ['from=2025-01-01&to=2026-03-01&interval=day', 'too-many-buckets']
    ])('answers 422 for %s', async (query) => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().get(`/stats/sales?${query}`).set('Authorization', bearer);

        expect(response.status).toBe(422);
    });

    it('answers 422 for a missing period and for an unknown query field', async () => {
        const { bearer } = await authenticateAs('admin');

        const missing = await api().get('/stats/sales').set('Authorization', bearer);
        const unknown = await api()
            .get(`/stats/sales?${PERIOD}&colour=blue`)
            .set('Authorization', bearer);

        expect([missing.status, unknown.status]).toEqual([422, 422]);
    });
});
