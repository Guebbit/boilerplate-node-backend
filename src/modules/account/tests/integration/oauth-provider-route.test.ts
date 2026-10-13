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
    return { state, cookies: cookieHeader(response, 'oauth_state', 'oauth_verifier') };
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
