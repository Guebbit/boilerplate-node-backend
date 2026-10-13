/**
 * @module
 * `oauth/providers/google.ts` — the authorize URL it builds, and what it trusts (or refuses) after a
 * token exchange. `fetch` is mocked throughout, answering the token endpoint with an RS256-shaped
 * ID token, so the library's own checks (issuer, audience, expiry, state) are what these cases
 * exercise. The signature is not one of them: see the module's own doc for why.
 */

import { isOAuthProviderConfigured } from '../../oauth/config';
import { googleOAuthProvider } from '../../oauth/providers/google';
import { setEnvironment } from '@tests/environment';
import { SignJWT, generateKeyPair } from 'jose';

/** The client id, which doubles as the `aud` claim every accepted ID token must carry. */
const CLIENT_ID = 'test-google-client-id';

/** Where Google is told to send the user back — asserted verbatim, not parsed. */
const REDIRECT_URI = 'https://api.test/account/oauth/google/callback';

/**
 * The callback URL as the controller builds it: the redirect URI plus the query exactly as Google's
 * redirect carried it — `iss` included, since Google publishes that it sends one.
 *
 * @param query - the raw query string, without the `?`
 */
const callbackWith = (
    query = 'code=a-code&state=the-state&iss=https%3A%2F%2Faccounts.google.com'
) => new URL(`${REDIRECT_URI}?${query}`);

/** What the attempt kept at the start. */
const EXPECTED = { state: 'the-state', codeVerifier: 'the-verifier' };

/** A key pair to give the test ID tokens a well-formed RS256 signature. */
let signing: Awaited<ReturnType<typeof generateKeyPair>>;

beforeAll(async () => {
    signing = await generateKeyPair('RS256');
});

beforeEach(() => {
    setEnvironment({ NODE_OAUTH_GOOGLE_CLIENT_ID: CLIENT_ID });
    setEnvironment({ NODE_OAUTH_GOOGLE_CLIENT_SECRET: 'test-google-client-secret' });
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** The claims of a valid Google ID token, to override one at a time. */
const validClaims = () => ({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-subject-1',
    email: 'ada@example.com',
    email_verified: true,
    name: 'Ada Lovelace',
    picture: 'https://example.com/ada.png'
});

/** An RS256 ID token over `claims`; `expiresIn` is relative seconds, negative for an expired one. */
const idToken = (claims: Record<string, unknown>, { expiresIn = 3600 } = {}): Promise<string> =>
    new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
        .sign(signing.privateKey);

/**
 * Stubs Google's token endpoint to answer `tokenBody`. The spy sees every call, so a case can
 * assert what was sent.
 */
const mockGoogle = (tokenBody: unknown, tokenStatus = 200) =>
    jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() =>
            Promise.resolve(Response.json(tokenBody, { status: tokenStatus }))
        );

/** A token endpoint body carrying `id_token` the way Google answers. */
const tokenResponse = (idTokenValue: string | undefined) => ({
    access_token: 'google-access-token',
    token_type: 'Bearer',
    expires_in: 3600,
    ...(idTokenValue && { id_token: idTokenValue })
});

/** One redemption of the callback every case starts from. */
const exchange = () => googleOAuthProvider.exchangeCode(callbackWith(), EXPECTED);

describe('google provider configuration', () => {
    it('is true once both env vars are set', () => {
        expect(isOAuthProviderConfigured('google')).toBe(true);
    });

    it('is false when either half is missing', () => {
        setEnvironment({ NODE_OAUTH_GOOGLE_CLIENT_SECRET: undefined });
        expect(isOAuthProviderConfigured('google')).toBe(false);
    });
});

describe('googleOAuthProvider.authorizeUrl', () => {
    it('points at the consent screen with the client id, redirect, state and PKCE challenge carried along', () => {
        const url = new URL(
            googleOAuthProvider.authorizeUrl('the-state', REDIRECT_URI, 'the-challenge')
        );

        expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
        expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
        expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('state')).toBe('the-state');
        expect(url.searchParams.get('scope')).toBe('openid email profile');
        expect(url.searchParams.get('code_challenge')).toBe('the-challenge');
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });
});

describe('googleOAuthProvider.exchangeCode', () => {
    it('resolves the identity from the verified ID token claims', async () => {
        mockGoogle(tokenResponse(await idToken(validClaims())));

        await expect(exchange()).resolves.toEqual({
            providerId: 'google-subject-1',
            email: 'ada@example.com',
            emailVerified: true,
            name: 'Ada Lovelace',
            imageUrl: 'https://example.com/ada.png'
        });
    });

    it('sends the code, the PKCE verifier, the redirect and the client secret to the token endpoint', async () => {
        const spy = mockGoogle(tokenResponse(await idToken(validClaims())));

        await exchange();

        const [url, init] = spy.mock.calls[0] ?? [];
        // The library sends a form body: a string or a `URLSearchParams`, both read the same way.
        const body = new URLSearchParams(init?.body as string | URLSearchParams);
        expect(url).toBe('https://oauth2.googleapis.com/token');
        expect(body.get('grant_type')).toBe('authorization_code');
        expect(body.get('code')).toBe('a-code');
        expect(body.get('code_verifier')).toBe('the-verifier');
        expect(body.get('redirect_uri')).toBe(REDIRECT_URI);
        expect(body.get('client_id')).toBe(CLIENT_ID);
        expect(body.get('client_secret')).toBe('test-google-client-secret');
    });

    it('refuses a callback whose state is not the one this attempt made, before any request', async () => {
        const spy = mockGoogle(tokenResponse(await idToken(validClaims())));

        await expect(
            googleOAuthProvider.exchangeCode(
                callbackWith('code=a-code&state=forged&iss=https%3A%2F%2Faccounts.google.com'),
                EXPECTED
            )
        ).rejects.toThrow();
        expect(spy).not.toHaveBeenCalled();
    });

    it('refuses a callback that names another issuer, before any request (RFC 9207)', async () => {
        const spy = mockGoogle(tokenResponse(await idToken(validClaims())));

        await expect(
            googleOAuthProvider.exchangeCode(
                callbackWith('code=a-code&state=the-state&iss=https%3A%2F%2Fevil.example'),
                EXPECTED
            )
        ).rejects.toThrow();
        expect(spy).not.toHaveBeenCalled();
    });

    it('refuses a callback that names no issuer at all, since Google is known to send one', async () => {
        const spy = mockGoogle(tokenResponse(await idToken(validClaims())));

        await expect(
            googleOAuthProvider.exchangeCode(callbackWith('code=a-code&state=the-state'), EXPECTED)
        ).rejects.toThrow();
        expect(spy).not.toHaveBeenCalled();
    });

    it('refuses a repeated `code`, which only the raw query can show', async () => {
        const spy = mockGoogle(tokenResponse(await idToken(validClaims())));

        await expect(
            googleOAuthProvider.exchangeCode(
                callbackWith(
                    'code=a-code&code=another&state=the-state&iss=https%3A%2F%2Faccounts.google.com'
                ),
                EXPECTED
            )
        ).rejects.toThrow();
        expect(spy).not.toHaveBeenCalled();
    });

    it('refuses a callback that carries an `error` instead of a code', async () => {
        const spy = mockGoogle(tokenResponse(await idToken(validClaims())));

        await expect(
            googleOAuthProvider.exchangeCode(
                callbackWith(
                    'error=access_denied&state=the-state&iss=https%3A%2F%2Faccounts.google.com'
                ),
                EXPECTED
            )
        ).rejects.toThrow();
        expect(spy).not.toHaveBeenCalled();
    });

    it('lets the extra parameters Google adds through', async () => {
        mockGoogle(tokenResponse(await idToken(validClaims())));

        await expect(
            googleOAuthProvider.exchangeCode(
                callbackWith(
                    'code=a-code&state=the-state&iss=https%3A%2F%2Faccounts.google.com&scope=openid+email&authuser=0&prompt=consent'
                ),
                EXPECTED
            )
        ).resolves.toMatchObject({ providerId: 'google-subject-1' });
    });

    it('refuses the bare `accounts.google.com` issuer spelling: only the https form is pinned', async () => {
        mockGoogle(tokenResponse(await idToken({ ...validClaims(), iss: 'accounts.google.com' })));

        await expect(exchange()).rejects.toThrow();
    });

    it('rejects a token naming a different audience', async () => {
        mockGoogle(tokenResponse(await idToken({ ...validClaims(), aud: 'someone-elses-client' })));

        await expect(exchange()).rejects.toThrow();
    });

    it('rejects an unrecognised issuer', async () => {
        mockGoogle(tokenResponse(await idToken({ ...validClaims(), iss: 'https://evil.example' })));

        await expect(exchange()).rejects.toThrow();
    });

    it('rejects an expired token', async () => {
        mockGoogle(tokenResponse(await idToken(validClaims(), { expiresIn: -60 })));

        await expect(exchange()).rejects.toThrow();
    });

    it('rejects a response with no id_token at all', async () => {
        mockGoogle(tokenResponse(undefined));

        await expect(exchange()).rejects.toThrow();
    });

    it('rejects when Google answers with a non-2xx status', async () => {
        mockGoogle({ error: 'invalid_grant' }, 400);

        await expect(exchange()).rejects.toThrow();
    });

    it('treats an unverified email as unverified, not merely absent', async () => {
        mockGoogle(tokenResponse(await idToken({ ...validClaims(), email_verified: false })));

        await expect(exchange()).resolves.toMatchObject({ emailVerified: false });
    });

    it('rejects a token with no subject, rather than minting an undefined providerId', async () => {
        const { sub: _sub, ...withoutSub } = validClaims();
        mockGoogle(tokenResponse(await idToken(withoutSub)));

        await expect(exchange()).rejects.toThrow();
    });

    it('never follows a redirect from the token endpoint', async () => {
        const spy = mockGoogle(tokenResponse(await idToken(validClaims())));

        await exchange();

        expect(spy).toHaveBeenCalledTimes(1);
        for (const [, options] of spy.mock.calls)
            expect(options).toMatchObject({ redirect: 'error' });
    });

    it('refuses an answer longer than the byte cap instead of buffering it', async () => {
        jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('x'.repeat(1_048_577)));

        // The library wraps what its `fetch` threw; the cap's own message rides in `cause`.
        await expect(exchange()).rejects.toHaveProperty(
            'cause.message',
            expect.stringMatching(/longer than/)
        );
    });

    /*
     * `fetch` is stubbed to only ever settle when the request's OWN `AbortSignal` fires, the way a
     * real aborted fetch behaves, so this proves the deadline reaches the request rather than
     * merely proving a timer exists somewhere.
     */
    it('aborts and rejects rather than waiting forever on a hung Google', async () => {
        jest.useFakeTimers();
        jest.spyOn(globalThis, 'fetch').mockImplementation(
            (_input, init) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        reject(new Error('The operation was aborted.'));
                    });
                })
        );

        const attempt = exchange();
        const assertion = expect(attempt).rejects.toThrow();
        jest.runAllTimers();
        await assertion;

        jest.useRealTimers();
    });
});
