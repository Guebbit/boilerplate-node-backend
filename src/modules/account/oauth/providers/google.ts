/**
 * @module
 * Google OAuth/OIDC on `openid-client`. The code exchange returns an ID token, and the library
 * checks its issuer, audience, expiry and issue time before this file reads the identity off it,
 * so there is no second `userinfo` round trip.
 *
 * The signature is NOT checked, deliberately: the token came straight from Google's token endpoint
 * over TLS, which OpenID Connect Core 3.1.3.7 step 6 accepts in place of a signature check. The
 * same trust boundary already protects the `code` and the access token in that exchange.
 */

import type * as client from 'openid-client';
import type { OAuthIdentity, OAuthProvider } from './port';
import { authorizationUrlFor, configurationFor, redeemCode } from './client';

/** This registry's key — also the value Google's docs use, and what lands on `OAuthAccount.provider`. */
const PROVIDER_NAME = 'google';

/**
 * Google's endpoints, written down rather than discovered. `issuer` is the value the ID token's
 * `iss` must equal exactly: the library refuses the legacy bare `accounts.google.com` form Google
 * documents as also possible, which Google's current tokens do not use.
 * https://accounts.google.com/.well-known/openid-configuration
 */
const SERVER: client.ServerMetadata = {
    issuer: 'https://accounts.google.com',
    authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_endpoint: 'https://oauth2.googleapis.com/token'
};

/**
 * What a verified ID token's claims must carry for this app to use them: a subject to key the
 * identity on (a token without one would give every account one shared identity row) and an
 * address.
 *
 * @param claims - the verified claims, as the library types them
 * @throws {Error} when the subject or the email is missing
 */
const identityOf = (claims: client.IDToken | undefined): OAuthIdentity => {
    if (!claims) throw new Error('Google token exchange: no id_token in response');
    const { sub, email, email_verified: verified, name, picture } = claims;
    if (typeof sub !== 'string' || sub.length === 0)
        throw new Error('Google ID token: missing subject');
    if (typeof email !== 'string') throw new Error('Google ID token: missing email');
    return {
        providerId: sub,
        email,
        emailVerified: verified === true || verified === 'true',
        name: typeof name === 'string' ? name : undefined,
        imageUrl: typeof picture === 'string' ? picture : undefined
    };
};

/**
 * Google behind the OAuth port. Identity comes from the ID token's claims, checked by the library
 * against the issuer, audience and expiry.
 */
export const googleOAuthProvider: OAuthProvider = {
    name: PROVIDER_NAME,

    // https://developers.google.com/identity/protocols/oauth2/web-server#httprest
    // Scope `openid email profile` is what makes Google return an ID token with these claims.
    authorizeUrl: (state, redirectUri, codeChallenge) =>
        authorizationUrlFor(configurationFor(PROVIDER_NAME, SERVER), {
            redirectUri,
            scope: 'openid email profile',
            state,
            codeChallenge
        }),

    exchangeCode: (callback, expected) =>
        redeemCode(configurationFor(PROVIDER_NAME, SERVER), callback, expected).then((tokens) =>
            identityOf(tokens.claims())
        )
};
