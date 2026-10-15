/**
 * The session cookie as a credential, judged against the spec: a `cookie`-mode browser carries no
 * bearer, so the declared `cookieAuth` alternative and the origin `403` on unsafe methods are the
 * only contract it has. Every other suite logs in with `transport: 'bearer'` and never meets them.
 *
 * Sets the mode itself, so it runs in both contract lanes.
 */

import '@tests/contract';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';

setupTestDb();

/** The one allowed frontend origin of this file. */
const FRONTEND = 'https://shop.example';

/** Signs in as a browser would — no `transport` — and answers the `Cookie` header it keeps. */
const browserCookie = async (): Promise<string> => {
    const user = await createUser({ email: 'browser@example.com', verifiedAt: new Date() });
    const response = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    const cookies = response.get('Set-Cookie') ?? [];
    return cookies.find((cookie) => cookie.startsWith('__Host-session='))!.split(';', 1)[0];
};

beforeEach(() => {
    setEnvironment({ NODE_SESSION_MODE: 'cookie', NODE_CORS_ORIGIN: FRONTEND });
});

describe('a cookie-authenticated request', () => {
    it('matches the contract on a read', async () => {
        const cookie = await browserCookie();

        const response = await api().get('/account').set('Cookie', cookie);

        expect(response.status).toBe(200);
    });

    it('matches the contract on a write from the allowed origin', async () => {
        const cookie = await browserCookie();

        const response = await api()
            .patch('/account')
            .set('Cookie', cookie)
            .set('Origin', FRONTEND)
            .send({ username: 'renamed-browser' });

        expect(response.status).toBe(200);
    });

    it('is refused with the declared 403 on a write from a foreign origin', async () => {
        const cookie = await browserCookie();

        const response = await api()
            .patch('/account')
            .set('Cookie', cookie)
            .set('Origin', 'https://evil.example')
            .send({ username: 'renamed-by-attacker' });

        expect(response.status).toBe(403);
    });
});
