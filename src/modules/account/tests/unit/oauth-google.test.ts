/**
 * @module
 * `oauth/providers/google.ts` — the authorize URL it builds, and the ID-token claims it trusts (or
 * refuses) after a token exchange. `fetch` is mocked throughout: this is the boundary the provider
 * owns, not a live call to Google.
 */

import { sign } from 'jsonwebtoken';
import { googleOAuthProvider, googleConfigured } from '../../oauth/providers/google';

const CLIENT_ID = 'test-google-client-id';
const REDIRECT_URI = 'https://api.test/account/oauth/google/callback';

/** A decodable-but-unverified ID token, shaped like Google's — `exchangeCode` never checks the signature. */
const idToken = (claims: Record<string, unknown>): string =>
    sign(claims, 'irrelevant-signing-key', { algorithm: 'HS256', noTimestamp: true });

const originalEnvironment = {
    id: process.env.NODE_OAUTH_GOOGLE_CLIENT_ID,
    secret: process.env.NODE_OAUTH_GOOGLE_CLIENT_SECRET
};

beforeEach(() => {
    process.env.NODE_OAUTH_GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.NODE_OAUTH_GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
});

afterEach(() => {
    if (originalEnvironment.id === undefined) delete process.env.NODE_OAUTH_GOOGLE_CLIENT_ID;
    else process.env.NODE_OAUTH_GOOGLE_CLIENT_ID = originalEnvironment.id;
    if (originalEnvironment.secret === undefined)
        delete process.env.NODE_OAUTH_GOOGLE_CLIENT_SECRET;
    else process.env.NODE_OAUTH_GOOGLE_CLIENT_SECRET = originalEnvironment.secret;
    jest.restoreAllMocks();
});

describe('googleConfigured', () => {
    it('is true once both env vars are set', () => {
        expect(googleConfigured()).toBe(true);
    });

    it('is false when either half is missing', () => {
        delete process.env.NODE_OAUTH_GOOGLE_CLIENT_SECRET;
        expect(googleConfigured()).toBe(false);
    });
});

describe('googleOAuthProvider.authorizeUrl', () => {
    it('points at the consent screen with the client id, redirect and state carried along', () => {
        const url = new URL(googleOAuthProvider.authorizeUrl('the-state', REDIRECT_URI));

        expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
        expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
        expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('state')).toBe('the-state');
        expect(url.searchParams.get('scope')).toContain('email');
    });
});

/** Stubs the token endpoint to answer with the given `id_token` (or none at all). */
const mockTokenResponse = (idTokenValue: string | undefined) =>
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id_token: idTokenValue })
    } as Response);

describe('googleOAuthProvider.exchangeCode', () => {
    const validClaims = {
        iss: 'https://accounts.google.com',
        aud: CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: 'google-subject-1',
        email: 'ada@example.com',
        email_verified: true,
        name: 'Ada Lovelace',
        picture: 'https://example.com/ada.png'
    };

    it('resolves the identity from the ID token claims', async () => {
        mockTokenResponse(idToken(validClaims));

        const identity = await googleOAuthProvider.exchangeCode('a-code', REDIRECT_URI);

        expect(identity).toEqual({
            providerId: 'google-subject-1',
            email: 'ada@example.com',
            emailVerified: true,
            name: 'Ada Lovelace',
            imageUrl: 'https://example.com/ada.png'
        });
    });

    it('accepts the other documented issuer spelling', async () => {
        mockTokenResponse(idToken({ ...validClaims, iss: 'accounts.google.com' }));

        await expect(
            googleOAuthProvider.exchangeCode('a-code', REDIRECT_URI)
        ).resolves.toMatchObject({ providerId: 'google-subject-1' });
    });

    it('rejects a token naming a different audience', async () => {
        mockTokenResponse(idToken({ ...validClaims, aud: 'someone-elses-client-id' }));

        await expect(googleOAuthProvider.exchangeCode('a-code', REDIRECT_URI)).rejects.toThrow(
            /audience/
        );
    });

    it('rejects an unrecognised issuer', async () => {
        mockTokenResponse(idToken({ ...validClaims, iss: 'https://evil.example.com' }));

        await expect(googleOAuthProvider.exchangeCode('a-code', REDIRECT_URI)).rejects.toThrow(
            /issuer/
        );
    });

    it('rejects an expired token', async () => {
        mockTokenResponse(idToken({ ...validClaims, exp: Math.floor(Date.now() / 1000) - 60 }));

        await expect(googleOAuthProvider.exchangeCode('a-code', REDIRECT_URI)).rejects.toThrow(
            /expired/
        );
    });

    it('rejects a response with no id_token at all', async () => {
        mockTokenResponse(undefined);

        await expect(googleOAuthProvider.exchangeCode('a-code', REDIRECT_URI)).rejects.toThrow();
    });

    it('rejects when Google answers with a non-2xx status', async () => {
        jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 400 } as Response);

        await expect(googleOAuthProvider.exchangeCode('a-code', REDIRECT_URI)).rejects.toThrow();
    });

    it('treats an unverified email as unverified, not merely absent', async () => {
        mockTokenResponse(idToken({ ...validClaims, email_verified: false }));

        await expect(
            googleOAuthProvider.exchangeCode('a-code', REDIRECT_URI)
        ).resolves.toMatchObject({ emailVerified: false });
    });
});
