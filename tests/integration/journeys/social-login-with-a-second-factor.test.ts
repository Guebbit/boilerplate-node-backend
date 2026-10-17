/**
 * @module
 * Journey: social login with a second factor.
 *
 * An account made by a social sign-in arms an authenticator, then signs in the same way again.
 * The provider alone no longer gets a session: the callback leaves a challenge cookie, the code
 * answers it, and the session that results is the one the following calls run on.
 */
import '@tests/contract';
import {
    GetAccount200Response,
    ListOAuthLinks200Response,
    ListSessions200Response
} from '@api/schemas.zod';
import { fakeOAuthProvider } from '@scenarios/support/doubles/oauth-fake';
import { registerOAuthProvider } from '@modules/account/oauth/providers';
import { setupTestDb } from '@tests/setup-test-db';
import { api, bearerForCookie } from '@tests/http';
import { bodyOf } from '@tests/body-of';
import { cookieHeader, setCookie } from '@tests/cookies';
import { codeFor } from '@tests/totp';

setupTestDb();

beforeAll(() => {
    registerOAuthProvider('fake', () => fakeOAuthProvider);
});

/**
 * One start-to-callback round trip through the fake provider. Cookies are copied by hand, because
 * supertest's agent does not replay `__Host-` cookies over http.
 */
const socialSignIn = async () => {
    const start = await api().get('/account/oauth/fake');
    const callback = new URL(start.headers.location);

    return api()
        .get(callback.pathname + callback.search)
        .set('Cookie', cookieHeader(start, 'oauth_state', 'oauth_verifier'));
};

it('asks for the code after the provider, and runs the session on the answer', async () => {
    // The first sign-in makes the account, already verified by the provider.
    const created = await socialSignIn();
    expect(setCookie(created, '__Host-session')).toBeTruthy();
    const bearer = await bearerForCookie(setCookie(created, '__Host-session') ?? '');
    const setup = await api()
        .post('/account/2fa/methods/totp/setup')
        .set('Authorization', bearer)
        .send();
    const { secret } = setup.body.data as { secret: string };
    await api()
        .post('/account/2fa/methods/totp/confirm')
        .set('Authorization', bearer)
        .send({ code: await codeFor(secret, 0) })
        .expect(200);

    // The second sign-in stops at the challenge: no session, only the cookie that names it.
    const challenged = await socialSignIn();
    const location = new URL(challenged.headers.location);
    expect(location.searchParams.get('mfaRequired')).toBe('1');
    expect(setCookie(challenged, '__Host-session')).toBeUndefined();
    const challenge = setCookie(challenged, 'oauth_mfa_challenge') ?? '';
    expect(challenge).toBeTruthy();

    // A wrong code gets nothing; the right one gets the session.
    await api()
        .post('/account/login/2fa')
        .set('Cookie', challenge)
        .send({ code: '000000' })
        .expect(422);
    const finished = await api()
        .post('/account/login/2fa')
        .set('Cookie', challenge)
        .send({ code: await codeFor(secret, 1) })
        .expect(200);
    const session = await bearerForCookie(setCookie(finished, '__Host-session') ?? '');

    // The session works for what follows: the provider's address, its link, and the sessions it holds.
    const account = bodyOf(
        await api().get('/account').set('Authorization', session),
        GetAccount200Response
    ).data;
    expect(account).toMatchObject({ email: 'oauth.demo@example.com' });
    expect(account.verifiedAt).toEqual(expect.any(String));
    const { links } = bodyOf(
        await api().get('/account/oauth/links').set('Authorization', session),
        ListOAuthLinks200Response
    ).data;
    expect(links.map(({ provider }) => provider)).toEqual(['fake']);
    const { sessions } = bodyOf(
        await api().get('/account/sessions').set('Authorization', session),
        ListSessions200Response
    ).data;
    expect(sessions).toHaveLength(2);

    // The challenge was spent with the session it bought.
    await api()
        .post('/account/login/2fa')
        .set('Cookie', challenge)
        .send({ code: await codeFor(secret, 1) })
        .expect(401);
});
