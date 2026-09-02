/**
 * @module
 * Google OAuth/OIDC — the code exchange returns an ID token (a signed JWT) that already carries
 * the identity, so this reads that instead of a second `userinfo` round trip.
 */

import { decode } from 'jsonwebtoken';
import { getOAuthCredentials, isOAuthProviderConfigured } from '../config';
import type { OAuthIdentity, OAuthProvider } from './port';

/** This registry's key — also the value Google's docs use, and what lands on `OAuthAccount.provider`. */
const PROVIDER_NAME = 'google';

/** Google's own OIDC issuer values — the ID token's `iss` claim carries one or the other. */
const VALID_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/** The claims this app reads off Google's ID token. Everything else in it is ignored. */
interface GoogleIdTokenClaims {
    iss: string;
    aud: string;
    exp: number;
    sub: string;
    email: string;
    email_verified?: boolean | string;
    name?: string;
    picture?: string;
}

/** Whether both `NODE_OAUTH_GOOGLE_CLIENT_ID`/`_CLIENT_SECRET` are set. */
export const googleConfigured = (): boolean => isOAuthProviderConfigured(PROVIDER_NAME);

/**
 * Verify the claims this app actually depends on. Signature verification is deliberately skipped:
 * this token was fetched directly from `https://oauth2.googleapis.com/token` over a
 * server-to-server HTTPS call this app made itself, never handed to it by the browser — the same
 * trust boundary that already protects `code` and `access_token` in this exchange. `aud`/`iss`/
 * `exp` are still checked, since decoding without verifying is only as safe as the channel it came
 * over, never a substitute for checking the token actually names THIS app and hasn't expired.
 * https://developers.google.com/identity/openid-connect/openid-connect#validatinganidtoken
 */
const assertValidClaims = (claims: GoogleIdTokenClaims): void => {
    const { clientId } = getOAuthCredentials(PROVIDER_NAME);
    if (!VALID_ISSUERS.has(claims.iss)) throw new Error('Google ID token: unexpected issuer');
    if (claims.aud !== clientId) throw new Error('Google ID token: unexpected audience');
    if (claims.exp * 1000 < Date.now()) throw new Error('Google ID token: expired');
};

export const googleOAuthProvider: OAuthProvider = {
    name: PROVIDER_NAME,

    authorizeUrl: (state, redirectUri) => {
        const { clientId } = getOAuthCredentials(PROVIDER_NAME);
        // https://developers.google.com/identity/protocols/oauth2/web-server#httprest
        const query = new URLSearchParams({
            client_id: clientId ?? '',
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'openid email profile',
            state
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
    },

    exchangeCode: (code, redirectUri) => {
        const { clientId, clientSecret } = getOAuthCredentials(PROVIDER_NAME);
        // https://developers.google.com/identity/protocols/oauth2/web-server#exchange-authorization-code
        return fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: clientId ?? '',
                client_secret: clientSecret ?? '',
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            })
        })
            .then((response) => {
                if (!response.ok)
                    throw new Error(`Google token exchange failed: ${response.status}`);
                return response.json() as Promise<{ id_token?: string }>;
            })
            .then(({ id_token: idToken }): OAuthIdentity => {
                if (!idToken) throw new Error('Google token exchange: no id_token in response');

                // `jsonwebtoken`: decode-only, no `verify()` — see `assertValidClaims`'s doc for why.
                // https://github.com/auth0/node-jsonwebtoken#jwtdecodetoken--options
                const claims = decode(idToken, { json: true }) as GoogleIdTokenClaims | null;
                if (!claims) throw new Error('Google token exchange: malformed id_token');
                assertValidClaims(claims);

                return {
                    providerId: claims.sub,
                    email: claims.email,
                    emailVerified:
                        claims.email_verified === true || claims.email_verified === 'true',
                    name: claims.name,
                    imageUrl: claims.picture
                };
            });
    }
};
