/**
 * @module
 * `GET /orders/export` over HTTP: reached through the router (`/export` is not an order id), behind
 * `orders.any.export` and a fresh session, never cached, and refusing an oversized result before a
 * byte of the file. The CSV's content and the cap's arithmetic are the service suite's.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { setCookie } from '@tests/cookies';
import { freezeDate, advanceDate } from '@tests/clock';
import { reauthWindowSeconds } from '@kernel/config';
import { createAdminUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';

setupTestDb();

afterEach(() => jest.useRealTimers());

/** One order of the caller's own, so the file has a line to carry. */
const seedOrderFor = async (user: Parameters<typeof createOrder>[0]) =>
    createOrder(user, [toOrderItem(await createProduct(), 1)]);

describe('GET /orders/export', () => {
    it('answers an admin a private, uncached CSV attachment, and is not read as an order id', async () => {
        const { bearer, user } = await authenticateAs('admin');
        await seedOrderFor(user);

        const response = await api().get('/orders/export').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/^text\/csv/);
        expect(response.headers['content-disposition']).toContain('attachment');
        expect(response.headers['cache-control']).toBe('private, no-store');
        expect(response.text.trim().split('\n')).toHaveLength(2);
    });

    it('answers a manager, who holds the key too', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api().get('/orders/export').set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it.each(['customer', 'support', 'warehouse', 'moderator'])(
        'refuses %s, who may read orders but not take them out',
        async (role) => {
            const { bearer } = await authenticateAsRole(role);

            const response = await api().get('/orders/export').set('Authorization', bearer);

            expect(response.status).toBe(403);
        }
    );

    it('refuses an anonymous caller', async () => {
        const response = await api().get('/orders/export');

        expect(response.status).toBe(401);
    });

    it('refuses an admin whose session is older than the sensitive window', async () => {
        freezeDate();
        const user = await createAdminUser({ verifiedAt: new Date() });
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD, remember: 'short' });
        const jwtCookie = setCookie(login, '__Host-jwt');
        advanceDate((reauthWindowSeconds('sensitive') + 1) * 1000);
        const refreshed = await api()
            .post('/account/refresh')
            .set('Cookie', jwtCookie ?? '');

        const response = await api()
            .get('/orders/export')
            .set('Authorization', `Bearer ${refreshed.body.data.token as string}`);

        expect(response.status).toBe(401);
    });

    it('answers 422 ORDER_EXPORT_TOO_LARGE over the cap, as JSON and before the file', async () => {
        setEnvironment({ NODE_ORDER_EXPORT_MAX_ROWS: '1' });
        const { bearer, user } = await authenticateAs('admin');
        await seedOrderFor(user);
        await seedOrderFor(user);

        const response = await api().get('/orders/export').set('Authorization', bearer);

        expect(response.status).toBe(422);
        expect(response.headers['content-type']).toMatch(/json/);
        expect(response.body.errors[0].code).toBe('ORDER_EXPORT_TOO_LARGE');
    });

    it('answers a bad filter with the list`s own 422', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .get('/orders/export?status=teleported')
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
    });
});
