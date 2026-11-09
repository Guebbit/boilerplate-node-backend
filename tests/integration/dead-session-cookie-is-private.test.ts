/**
 * A dead session cookie on a public cached read, in cookie mode.
 *
 * `getAuth` clears the cookie (a `Set-Cookie` delete) and carries on as a guest. That answer must
 * not be `public`: a shared cache could replay the clear to every visitor and log them out
 * (RFC 9111 §7.3). A visitor with no cookie still gets the shared, cacheable answer.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { createProduct } from '@modules/products/tests/factories';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { dropAllSessions } from '@modules/account/tests/factories';

setupTestDb();

beforeEach(() => {
    setEnvironment({ NODE_SESSION_MODE: 'cookie' });
});

/** Signs in as a browser would and answers the user plus the `Cookie` header it keeps. */
const signedInWithCookie = async () => {
    const user = await createUser({ verifiedAt: new Date() });
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    const session = (login.get('Set-Cookie') ?? []).find((c) => c.startsWith('__Host-session='));
    if (!session) throw new Error('the login set no session cookie');
    return { user, cookie: session.split(';', 1)[0] };
};

describe('GET /products in cookie mode', () => {
    it('answers private, no-cache and clears the cookie when the session is gone', async () => {
        await createProduct({ title: 'On sale', active: true });
        const { user, cookie } = await signedInWithCookie();
        await dropAllSessions(user.id);

        const response = await api().get('/products').set('Cookie', cookie);

        expect(response.status).toBe(200);
        expect(response.get('Set-Cookie')?.join(';')).toContain('__Host-session=;');
        expect(response.headers['cache-control']).toBe('private, no-cache');
    });

    it('stays public for a visitor who sends no cookie', async () => {
        await createProduct({ title: 'On sale', active: true });

        const response = await api().get('/products');

        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.headers['cache-control']).toMatch(/^public, max-age=/);
    });
});

describe('Vary on a public read', () => {
    it('names Cookie in cookie mode, where the cookie picks the caller', async () => {
        const response = await api().get('/products');

        expect(response.headers.vary).toContain('Cookie');
    });

    it('does not name Cookie in jwt mode', async () => {
        setEnvironment({ NODE_SESSION_MODE: 'jwt' });

        const response = await api().get('/products');

        expect(response.headers.vary).not.toContain('Cookie');
    });
});
