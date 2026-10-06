/**
 * @module
 * The refresh cookie is `__Host-` prefixed, refresh is a POST, and the three endpoints a cookie
 * alone authenticates (refresh, logout, the SSE streams) refuse a foreign `Origin` outright.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { setCookie, cookieHeader } from '@tests/cookies';
import { createUser, userRepository, PLAIN_PASSWORD } from '@modules/users/tests/factories';

setupTestDb();

/** The one origin `NODE_CORS_ORIGIN` lists for this file. */
const FRONTEND = 'https://shop.example';

beforeEach(() => {
    setEnvironment({ NODE_CORS_ORIGIN: FRONTEND });
});

/** A login, answering the refresh cookie as a `Cookie` header and the raw `Set-Cookie`. */
const login = async () => {
    const user = await createUser({ verifiedAt: new Date() });
    const response = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    return { user, response, cookie: cookieHeader(response, '__Host-jwt') };
};

describe('the refresh cookie', () => {
    it('is __Host- prefixed, Secure, HttpOnly, Path=/ and carries no Domain', async () => {
        const { response } = await login();

        const header = setCookie(response, '__Host-jwt') ?? '';
        expect(header).toMatch(/;\s*Secure/i);
        expect(header).toMatch(/;\s*HttpOnly/i);
        expect(header).toMatch(/;\s*Path=\//i);
        expect(header).not.toMatch(/;\s*Domain=/i);
        expect(setCookie(response, 'jwt')).toBeUndefined();
    });
});

describe('POST /account/refresh', () => {
    it('mints an access token for the frontend’s own origin, and for no Origin at all', async () => {
        const { cookie } = await login();

        const fromFrontend = await api()
            .post('/account/refresh')
            .set('Cookie', cookie)
            .set('Origin', FRONTEND);
        const noOrigin = await api()
            .post('/account/refresh')
            .set('Cookie', fromFrontend.headers['set-cookie']?.[0]?.split(';', 1)[0] ?? cookie);

        expect(fromFrontend.status).toBe(200);
        expect(noOrigin.status).toBe(200);
    });

    it('refuses a foreign origin outright, valid cookie or not, and rotates nothing', async () => {
        const { user, cookie } = await login();
        const before = await userRepository.findByIdWithCredentials(user.id);

        const response = await api()
            .post('/account/refresh')
            .set('Cookie', cookie)
            .set('Origin', 'https://evil.example');

        const after = await userRepository.findByIdWithCredentials(user.id);
        expect(response.status).toBe(403);
        expect(after?.tokens).toHaveLength(before?.tokens.length ?? -1);
        expect(after?.tokens.some((token) => token.supersededAt)).toBe(false);
    });

    it('is no longer a GET: a GET reaches no route', async () => {
        const { cookie } = await login();

        const response = await api().get('/account/refresh').set('Cookie', cookie);

        expect(response.status).toBe(404);
    });
});

describe('POST /account/logout', () => {
    it('logs out from the frontend’s origin', async () => {
        const { cookie } = await login();

        const response = await api()
            .post('/account/logout')
            .set('Cookie', cookie)
            .set('Origin', FRONTEND);

        expect(response.status).toBe(200);
    });

    it('refuses a foreign origin and revokes nothing', async () => {
        const { user, cookie } = await login();

        const response = await api()
            .post('/account/logout')
            .set('Cookie', cookie)
            .set('Origin', 'https://evil.example');

        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(response.status).toBe(403);
        expect(stored?.tokens.some((token) => token.type === 'refresh')).toBe(true);
    });
});

describe('the SSE streams a cookie alone authenticates', () => {
    it.each(['/observability/events', '/notifications/stream'])(
        '%s refuses a foreign origin before it looks at the cookie',
        async (path) => {
            const { cookie } = await login();

            const response = await api()
                .get(path)
                .set('Cookie', cookie)
                .set('Origin', 'https://evil.example');

            expect(response.status).toBe(403);
        }
    );
});
