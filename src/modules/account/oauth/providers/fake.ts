/**
 * @module
 * The fake identity provider — mirrors `payments/providers/fake.ts`: no network call, no consent
 * screen, gated behind `isDemoMode()`. `authorizeUrl` skips straight to the callback with a fixed
 * `code`, so clicking "Continue with Google" in a Cypress spec never has to leave this app; the
 * `state` still round-trips through the real cookie, so the CSRF check gets genuine coverage too.
 *
 * PKCE round-trips for real here too: a genuine provider stores the challenge server-side and
 * checks it at redemption, but this provider has no server-side store of its own, so the challenge
 * rides inside `code` itself (opaque to the callback controller, which only ever forwards it) and
 * `exchangeCode` re-derives and compares it — the same assertion a real provider makes, not a
 * no-op that would let a broken caller pass unnoticed.
 */

import { codeChallengeOf } from '../state';
import type { OAuthProvider } from './port';

/** Every fake `code` starts with this — `exchangeCode` refuses anything else. */
export const FAKE_OAUTH_CODE = 'fake-oauth-code';

/** What every fake login resolves to — one fixed, already-verified identity. */
const FAKE_IDENTITY = {
    providerId: 'fake-oauth-subject',
    email: 'oauth.demo@example.com',
    emailVerified: true,
    name: 'OAuth Demo',
    imageUrl: undefined
};

export const fakeOAuthProvider: OAuthProvider = {
    name: 'fake',

    // Lands the browser on the real callback route immediately, carrying the fixed code — with
    // the challenge appended, base64url so it needs no extra encoding — and the real `state`;
    // there is no consent screen to render, but both round trips (CSRF and PKCE) stay genuine.
    authorizeUrl: (state, redirectUri, codeChallenge) =>
        `${redirectUri}?code=${FAKE_OAUTH_CODE}.${codeChallenge}&state=${encodeURIComponent(state)}`,

    exchangeCode: (code, _redirectUri, codeVerifier) => {
        const [fixedPart, challenge] = code.split('.');
        if (fixedPart !== FAKE_OAUTH_CODE || !challenge)
            return Promise.reject(new Error('fake provider: unrecognised code'));

        // The same check a real provider makes at redemption — see the module doc for why this
        // provider has to make it itself instead of trusting the caller.
        if (codeChallengeOf(codeVerifier) !== challenge)
            return Promise.reject(new Error('fake provider: PKCE verifier does not match'));

        return Promise.resolve(FAKE_IDENTITY);
    }
};
