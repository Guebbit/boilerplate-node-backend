/**
 * @module
 * The OAuth callback route with the REAL Google and GitHub providers, `fetch` mocked at the
 * provider's own servers. What it pins is what the unit tests cannot see: that the callback URL
 * handed to the library is built on the `NODE_URL` base and carries the request's raw query, so a
 * forged `Host` cannot move the redirect URI, and a foreign, missing or repeated parameter fails
 * the login rather than being quietly dropped on the way.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { cookieHeader } from '@tests/cookies';
import { SignJWT, generateKeyPair } from 'jose';

setupTestDb();

/** The deployment's public address: the one place a redirect URI may come from. */
const API_BASE = 'https://api.example/';

/** The paired frontend: where the browser is sent once the callback is done. */
const FRONTEND = 'https://shop.example';

/** Google's client id, which doubles as the `aud` of every ID token it issues. */
const GOOGLE_CLIENT_ID = 'route-test-google-client';

/** What Google adds to a redirect (RFC 9207), url-encoded as it arrives. */
const GOOGLE_ISS = 'iss=https%3A%2F%2Faccounts.google.com';

/** A key pair to give the ID tokens a well-formed RS256 signature. */
let signing: Awaited<ReturnType<typeof generateKeyPair>>;

beforeAll(async () => {
    signing = await generateKeyPair('RS256');
});

beforeEach(() => {
    setEnvironment({
        NODE_URL: API_BASE,
        NODE_FRONTEND_URL: FRONTEND,
        NODE_MAIL_TRANSPORT: 'outbox',
        NODE_OAUTH_GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID,
        NODE_OAUTH_GOOGLE_CLIENT_SECRET: 'route-test-google-secret',
        NODE_OAUTH_GITHUB_CLIENT_ID: 'route-test-github-client',
        NODE_OAUTH_GITHUB_CLIENT_SECRET: 'route-test-github-secret'
    });
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** A signed Google ID token for one subject. */
const googleIdToken = () =>
    new SignJWT({
        iss: 'https://accounts.google.com',
        aud: GOOGLE_CLIENT_ID,
        sub: 'google-route-subject',
        email: 'route@example.com',
        email_verified: true
    })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(signing.privateKey);

/**
 * Stubs both providers' servers by URL and returns the spy, so a case can read what was sent.
 *
 * @param idToken - the ID token Google's token endpoint answers with
 */
const mockProviders = (idToken: string) =>
    jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.startsWith('https://oauth2.googleapis.com/token'))
            return Promise.resolve(
                Response.json({ access_token: 'g', token_type: 'Bearer', id_token: idToken })
            );
        if (url.startsWith('https://github.com/login/oauth/access_token'))
            return Promise.resolve(Response.json({ access_token: 'h', token_type: 'bearer' }));
        if (url.startsWith('https://api.github.com/user/emails'))
            return Promise.resolve(
                Response.json([{ email: 'route@example.com', primary: true, verified: true }])
            );
        if (url.startsWith('https://api.github.com/user'))
            return Promise.resolve(Response.json({ id: 4242, login: 'route', name: 'Route' }));
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

/** What the provider's redirect carries besides `code` and `state`: Google sends an issuer. */
const extraQuery = (provider: string) => (provider === 'google' ? `&${GOOGLE_ISS}` : '');

/** Starts a login: the CSRF `state`, and the two cookies the callback must present. */
const start = async (provider: string) => {
    const response = await api().get(`/account/oauth/${provider}`);
    expect(response.status).toBe(302);
    const state = new URL(response.headers.location).searchParams.get('state') ?? '';
    return {
        state,
        cookies: cookieHeader(response, '__Host-oauth_state', '__Host-oauth_verifier')
    };
};

describe.each(['google', 'github'])('GET /account/oauth/%s/callback', (provider) => {
    it('signs in, and sends the NODE_URL redirect URI whatever Host the request names', async () => {
        const spy = mockProviders(await googleIdToken());
        const { state, cookies } = await start(provider);

        const response = await api()
            .get(
                `/account/oauth/${provider}/callback?code=a-code&state=${state}${extraQuery(provider)}`
            )
            .set('Cookie', cookies)
            .set('Host', 'evil.example')
            .set('X-Forwarded-Proto', 'http');

        expect(response.status).toBe(302);
        expect(response.headers.location).not.toContain('error=');
        const tokenCall = spy.mock.calls.find(([input]) =>
            String(input instanceof Request ? input.url : input).includes('token')
        );
        const body = new URLSearchParams(tokenCall?.[1]?.body as string | URLSearchParams);
        expect(body.get('redirect_uri')).toBe(`${API_BASE}account/oauth/${provider}/callback`);
        expect(body.get('code')).toBe('a-code');
    });

    it('fails the login, with no request to the provider, on a repeated `code`', async () => {
        const spy = mockProviders(await googleIdToken());
        const { state, cookies } = await start(provider);

        const response = await api()
            .get(
                `/account/oauth/${provider}/callback?code=a-code&code=another&state=${state}${extraQuery(provider)}`
            )
            .set('Cookie', cookies);

        expect(response.status).toBe(302);
        expect(response.headers.location).toContain('error=provider_error');
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('GET /account/oauth/google/callback issuer check (RFC 9207)', () => {
    it.each([
        ['names another issuer', '&iss=https%3A%2F%2Fevil.example'],
        ['names no issuer at all', '']
    ])('fails the login when the redirect %s', async (_label, issuer) => {
        const spy = mockProviders(await googleIdToken());
        const { state, cookies } = await start('google');

        const response = await api()
            .get(`/account/oauth/google/callback?code=a-code&state=${state}${issuer}`)
            .set('Cookie', cookies);

        expect(response.status).toBe(302);
        expect(response.headers.location).toContain('error=provider_error');
        expect(spy).not.toHaveBeenCalled();
    });
});

/** The `r=` (remaining) of the address budget, read off a response's `RateLimit` header. */
const addressRemaining = (response: { headers: Record<string, unknown> }): number => {
    const header = String(response.headers.ratelimit);
    const match = /"credentials-address";r=(\d+)/.exec(header);
    if (!match) throw new Error(`no address budget in RateLimit: ${header}`);
    return Number(match[1]);
};

/** A forged state/verifier cookie pair: both checks only compare the cookie to the query. */
const FORGED_COOKIES = '__Host-oauth_state=x; __Host-oauth_verifier=y';

/**
 * How many units of the address budget `callback` cost: the remaining count a probe request sees
 * before it, minus the one it sees after. The limiter writes `r=` before the handler runs, and a
 * refund lands after the response, so the second probe is what shows the first one's outcome.
 *
 * @param callback - the callback URL path and query to fire
 * @param cookies - the `Cookie` header to send with it
 */
const addressCost = async (callback: string, cookies: string): Promise<number> => {
    const first = await api().get(callback).set('Cookie', cookies);
    const second = await api().get(callback).set('Cookie', cookies);
    return addressRemaining(first) - addressRemaining(second);
};

/** Fires the GitHub callback for a login `start` began. */
const githubCallback = (login: { state: string; cookies: string }) =>
    api()
        .get(`/account/oauth/github/callback?code=a-code&state=${login.state}`)
        .set('Cookie', login.cookies);

describe('the callback and the credential budgets', () => {
    it('counts a redirected failure: a forged pair with ?error= spends the address budget', async () => {
        const cost = await addressCost(
            '/account/oauth/github/callback?error=access_denied&state=x',
            FORGED_COOKIES
        );

        expect(cost).toBe(1);
    });

    it.each([
        ['github', ''],
        ['google', `&${GOOGLE_ISS}`]
    ])('counts a garbage code that reaches the %s exchange', async (provider, issuer) => {
        const spy = jest
            .spyOn(globalThis, 'fetch')
            .mockImplementation(() =>
                Promise.resolve(Response.json({ error: 'invalid_grant' }, { status: 400 }))
            );

        const cost = await addressCost(
            `/account/oauth/${provider}/callback?code=garbage&state=x${issuer}`,
            FORGED_COOKIES
        );

        expect(spy).toHaveBeenCalled();
        expect(cost).toBe(1);
    });

    it('spends nothing on a successful callback', async () => {
        mockProviders(await googleIdToken());
        const first = await start('github');
        const second = await start('github');
        const one = await githubCallback(first);
        const two = await githubCallback(second);

        expect(one.headers.location).not.toContain('error=');
        expect(addressRemaining(one) - addressRemaining(two)).toBe(0);
    });
});
