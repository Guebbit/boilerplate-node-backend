/**
 * @module
 * The fake identity provider — mirrors `payments/providers/fake.ts`: no network call, no consent
 * screen, gated behind `isDemoMode()`. `authorizeUrl` skips straight to the callback with a fixed
 * `code`, so clicking "Continue with Google" in a Cypress spec never has to leave this app; the
 * `state` still round-trips through the real cookie, so the CSRF check gets genuine coverage too.
 */

import type { OAuthProvider } from './port';

/** The only `code` this provider's callback ever has to recognise. */
export const FAKE_OAUTH_CODE = 'fake-oauth-code';

/** What every fake login resolves to — one fixed, already-verified identity. */
export const fakeOAuthProvider: OAuthProvider = {
    name: 'fake',

    // Lands the browser on the real callback route immediately, carrying the fixed code and the
    // real `state` — there is no consent screen to render, but the CSRF round trip is unchanged.
    authorizeUrl: (state, redirectUri) =>
        `${redirectUri}?code=${FAKE_OAUTH_CODE}&state=${encodeURIComponent(state)}`,

    exchangeCode: (code) =>
        code === FAKE_OAUTH_CODE
            ? Promise.resolve({
                  providerId: 'fake-oauth-subject',
                  email: 'oauth.demo@example.com',
                  emailVerified: true,
                  name: 'OAuth Demo',
                  imageUrl: undefined
              })
            : Promise.reject(new Error('fake provider: unrecognised code'))
};
