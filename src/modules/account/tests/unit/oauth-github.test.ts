/**
 * @module
 * `oauth/providers/github.ts` — the authorize URL, and the three-call token exchange (token, user,
 * emails). `fetch` is mocked throughout, once per call in the order the provider makes them.
 */

import { githubOAuthProvider, githubConfigured } from '../../oauth/providers/github';

const CLIENT_ID = 'test-github-client-id';
const REDIRECT_URI = 'https://api.test/account/oauth/github/callback';

const jsonResponse = (body: unknown, ok = true): Response =>
    ({ ok, status: ok ? 200 : 400, json: () => Promise.resolve(body) }) as Response;

const originalEnvironment = {
    id: process.env.NODE_OAUTH_GITHUB_CLIENT_ID,
    secret: process.env.NODE_OAUTH_GITHUB_CLIENT_SECRET
};

beforeEach(() => {
    process.env.NODE_OAUTH_GITHUB_CLIENT_ID = CLIENT_ID;
    process.env.NODE_OAUTH_GITHUB_CLIENT_SECRET = 'test-github-client-secret';
});

afterEach(() => {
    if (originalEnvironment.id === undefined) delete process.env.NODE_OAUTH_GITHUB_CLIENT_ID;
    else process.env.NODE_OAUTH_GITHUB_CLIENT_ID = originalEnvironment.id;
    if (originalEnvironment.secret === undefined)
        delete process.env.NODE_OAUTH_GITHUB_CLIENT_SECRET;
    else process.env.NODE_OAUTH_GITHUB_CLIENT_SECRET = originalEnvironment.secret;
    jest.restoreAllMocks();
});

describe('githubConfigured', () => {
    it('is true once both env vars are set', () => {
        expect(githubConfigured()).toBe(true);
    });

    it('is false when either half is missing', () => {
        delete process.env.NODE_OAUTH_GITHUB_CLIENT_ID;
        expect(githubConfigured()).toBe(false);
    });
});

describe('githubOAuthProvider.authorizeUrl', () => {
    it('points at the consent screen with the client id, redirect and state carried along', () => {
        const url = new URL(githubOAuthProvider.authorizeUrl('the-state', REDIRECT_URI));

        expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
        expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
        expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
        expect(url.searchParams.get('state')).toBe('the-state');
        expect(url.searchParams.get('scope')).toContain('user:email');
    });
});

describe('githubOAuthProvider.exchangeCode', () => {
    const user = {
        id: 42,
        login: 'ada',
        name: 'Ada Lovelace',
        avatar_url: 'https://example.com/a.png'
    };
    const emails = [
        { email: 'ada-private@users.noreply.github.com', primary: false, verified: true },
        { email: 'ada@example.com', primary: true, verified: true }
    ];

    it('resolves the identity from the profile and the PRIMARY email', async () => {
        jest.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ access_token: 'gh-token' }))
            .mockResolvedValueOnce(jsonResponse(user))
            .mockResolvedValueOnce(jsonResponse(emails));

        const identity = await githubOAuthProvider.exchangeCode('a-code', REDIRECT_URI);

        expect(identity).toEqual({
            providerId: '42',
            email: 'ada@example.com',
            emailVerified: true,
            name: 'Ada Lovelace',
            imageUrl: 'https://example.com/a.png'
        });
    });

    it('falls back to the login when the profile carries no display name', async () => {
        jest.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ access_token: 'gh-token' }))
            .mockResolvedValueOnce(jsonResponse({ ...user, name: null }))
            .mockResolvedValueOnce(jsonResponse(emails));

        await expect(
            githubOAuthProvider.exchangeCode('a-code', REDIRECT_URI)
        ).resolves.toMatchObject({ name: 'ada' });
    });

    it('surfaces an unverified primary email rather than hiding it', async () => {
        jest.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ access_token: 'gh-token' }))
            .mockResolvedValueOnce(jsonResponse(user))
            .mockResolvedValueOnce(
                jsonResponse([{ email: 'ada@example.com', primary: true, verified: false }])
            );

        await expect(
            githubOAuthProvider.exchangeCode('a-code', REDIRECT_URI)
        ).resolves.toMatchObject({ emailVerified: false });
    });

    it('rejects when no email is marked primary', async () => {
        jest.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ access_token: 'gh-token' }))
            .mockResolvedValueOnce(jsonResponse(user))
            .mockResolvedValueOnce(
                jsonResponse([{ email: 'ada@example.com', primary: false, verified: true }])
            );

        await expect(githubOAuthProvider.exchangeCode('a-code', REDIRECT_URI)).rejects.toThrow(
            /primary/
        );
    });

    it('rejects when the token exchange carries an error instead of a token', async () => {
        jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            jsonResponse({ error: 'bad_verification_code' })
        );

        await expect(githubOAuthProvider.exchangeCode('a-code', REDIRECT_URI)).rejects.toThrow();
    });

    it('rejects when the profile call answers with a non-2xx status', async () => {
        // `/user` and `/user/emails` fire together (`Promise.all`), so both need a queued
        // response even though only the first's failure is what this case is testing.
        jest.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ access_token: 'gh-token' }))
            .mockResolvedValueOnce(jsonResponse({}, false))
            .mockResolvedValueOnce(jsonResponse(emails));

        await expect(githubOAuthProvider.exchangeCode('a-code', REDIRECT_URI)).rejects.toThrow();
    });
});
