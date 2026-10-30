/**
 * @module
 * The session answers carry what a client would otherwise ask for next: a sign-in answers with the
 * account view (account, abilities, idle clock), a refresh with the abilities. One test per door,
 * each asserting the SAME abilities `GET /account` publishes — one rule set, however it arrives.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { cookieHeader } from '@tests/cookies';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { getSessionMode } from '../../session/config';

setupTestDb();

/** A sign-in over HTTP, the way a client makes one. */
const signIn = (email: string) =>
    api().post('/account/login').send({ email, password: PLAIN_PASSWORD }).expect(200);

describe('a password sign-in', () => {
    it('answers with the account view, so no follow-up read is needed', async () => {
        const user = await createUser({ email: 'view@example.com' });

        const login = await signIn(user.email);

        expect(login.body.account).toMatchObject({ id: user.id, email: user.email });
        expect(login.body.account.abilities.tenant.length).toBeGreaterThan(0);
        expect(login.body.account.abilities).not.toHaveProperty('subjects');
        expect(typeof login.body.account.activity.lastActiveAt).toBe('string');
    });

    it('carries the very abilities GET /account answers next', async () => {
        const user = await createUser({ email: 'same@example.com' });

        const login = await signIn(user.email);
        // `jwt` mode hands a bearer; `cookie` mode keeps the credential in the cookie.
        const credential =
            typeof login.body.token === 'string'
                ? { Authorization: `Bearer ${login.body.token}` }
                : { Cookie: cookieHeader(login, '__Host-session') };
        const read = await api().get('/account').set(credential).expect(200);

        expect(login.body.account.abilities).toEqual(read.body.abilities);
    });

    it('answers a wrong password with no account view', async () => {
        const user = await createUser({ email: 'wrong@example.com' });

        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: 'not-the-password-1' })
            .expect(401);

        expect(login.body).not.toHaveProperty('account');
    });
});

describe('a token refresh', () => {
    it('answers with the abilities as they stand now (jwt mode; a cookie deployment has no refresh)', async () => {
        const user = await createUser({ email: 'refresh-view@example.com' });
        const login = await signIn(user.email);

        const refreshed = await api()
            .post('/account/refresh')
            .set('Cookie', cookieHeader(login, '__Host-session'));

        if (getSessionMode() === 'cookie') {
            expect(refreshed.status).toBe(404);
            return;
        }
        expect(refreshed.status).toBe(200);
        expect(refreshed.body.abilities).toEqual(login.body.account.abilities);
    });
});
