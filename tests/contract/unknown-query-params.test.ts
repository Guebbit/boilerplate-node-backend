/**
 * An unknown query parameter is a 422, not a silent no-op. A typo or a stale filter name that is
 * dropped quietly returns everything the caller may read, as though the filter had been honoured —
 * `?actor_user_id=` was documented for the audit read and ignored for as long as nobody tried it.
 *
 * Each route gets a control (the same request without the stray parameter answers 200), so the
 * 422 is earned by the parameter and not by a route that refuses everything.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAsRole } from '@tests/http';

setupTestDb();

/** The list reads a staff caller may make, each with the path a filter would be spelled on. */
const LIST_ROUTES = [
    '/products',
    '/orders',
    '/users',
    '/audit',
    '/returns',
    '/feedback',
    '/webhooks/subscriptions',
    '/api-keys'
] as const;

describe('a stray query parameter on a list read', () => {
    it.each(LIST_ROUTES)('GET %s answers 422 for it, and 200 without', async (route) => {
        const { bearer } = await authenticateAsRole('admin');

        const control = await api().get(route).set('Authorization', bearer);
        const stray = await api().get(`${route}?bogus=1`).set('Authorization', bearer);

        expect([control.status, stray.status]).toEqual([200, 422]);
    });

    // Documented in the data-protection page for the audit read, and ignored until now.
    it('refuses the documented-but-undeclared actor_user_id filter on the audit read', async () => {
        const { bearer } = await authenticateAsRole('admin');

        const response = await api().get('/audit?actor_user_id=abc').set('Authorization', bearer);

        expect(response.status).toBe(422);
    });

    it('counts exactly eight list routes, so an emptied table cannot pass', () => {
        expect(LIST_ROUTES).toHaveLength(8);
    });
});
