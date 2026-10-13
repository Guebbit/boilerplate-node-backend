/**
 * @module
 * What both OAuth adapters share on top of `openid-client`: the one `fetch` every provider call
 * goes through (a deadline, a body cap, no redirects) and the way a provider's static server
 * description becomes a client configuration. A provider's endpoints are written down in its own
 * file, never discovered over the network, so a login has no extra request to fail or to spoof.
 * See docs/modules/account-oauth.md.
 */

import * as client from 'openid-client';
import { readCappedText, DEFAULT_BODY_CAP_BYTES } from '@infrastructure/http/read-capped-body';
import { getOAuthCredentials, OAUTH_FETCH_TIMEOUT_MS } from '../config';
import type { OAuthExpectation } from './port';

/**
 * The `fetch` `openid-client` makes every call through: token exchange and key-set download alike.
 *
 * Three limits the library does not set itself:
 *  - a deadline, so a hung provider cannot hold an OAuth callback open;
 *  - a redirect is an error, never followed to a host nobody chose;
 *  - the body is read through a byte cap, then handed back as a fresh `Response`.
 *
 * https://github.com/panva/openid-client/blob/main/docs/variables/customFetch.md
 */
export const providerFetch: client.CustomFetch = (url, options) =>
    fetch(url, {
        ...options,
        // `AbortSignal.any`: the library's own signal (when it sets one) and ours, whichever fires first.
        signal: AbortSignal.any(
            [options.signal, AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS)].filter(
                (signal): signal is AbortSignal => signal !== undefined
            )
        ),
        redirect: 'error'
    }).then((response) =>
        readCappedText(response, DEFAULT_BODY_CAP_BYTES).then(
            (text) =>
                new Response(text, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                })
        )
    );

/**
 * A provider's client configuration, built from its written-down endpoints and the deployment's
 * credentials. Not memoised: a provider becomes configured the moment its variables are set.
 *
 * openid-client: `Configuration(server, clientId, clientSecret)` with a string third argument
 * sends the secret as a `client_secret_post` body field, which Google and GitHub both accept.
 * https://github.com/panva/openid-client/blob/main/docs/classes/Configuration.md
 *
 * @param name - the registry key, which picks the credentials
 * @param server - the provider's endpoints (and, for OIDC, its issuer and key-set address)
 */
export const configurationFor = (
    name: string,
    server: client.ServerMetadata
): client.Configuration => {
    const { clientId, clientSecret } = getOAuthCredentials(name);
    const configuration = new client.Configuration(server, clientId ?? '', clientSecret);
    configuration[client.customFetch] = providerFetch;
    return configuration;
};

/**
 * The consent-screen URL for a configuration.
 *
 * openid-client: `buildAuthorizationUrl` adds `client_id` and returns a `URL`; everything else
 * here is sent as given. `code_challenge_method=S256` is the only PKCE method offered.
 * https://github.com/panva/openid-client/blob/main/docs/functions/buildAuthorizationUrl.md
 *
 * @param configuration - the provider's configuration
 * @param parameters - `redirect_uri`, `scope` and `state`, plus the PKCE challenge
 * @returns the URL to send the browser to
 */
export const authorizationUrlFor = (
    configuration: client.Configuration,
    parameters: { redirectUri: string; scope: string; state: string; codeChallenge: string }
): string =>
    client
        .buildAuthorizationUrl(configuration, {
            redirect_uri: parameters.redirectUri,
            scope: parameters.scope,
            state: parameters.state,
            code_challenge: parameters.codeChallenge,
            code_challenge_method: 'S256'
        })
        .toString();

/**
 * Redeem an authorization code, with the library checking the whole authorization response.
 *
 * openid-client: `authorizationCodeGrant` takes the URL the provider redirected to, query string
 * included, and validates it as an authorization response: one `code`, the `state` against
 * `expectedState`, `error=` refused, and `iss` checked against the server's issuer (required when
 * the server metadata says the provider sends it, RFC 9207). Its `redirect_uri` for the token
 * request is that URL without the query. It sends the `code_verifier`, and for an OpenID provider
 * verifies the ID token (issuer, audience, expiry) before answering.
 * https://github.com/panva/openid-client/blob/main/docs/functions/authorizationCodeGrant.md
 *
 * @param configuration - the provider's configuration
 * @param callbackUrl - the callback URL carrying the provider's real query string
 * @param expected - what this attempt kept: the `state` and the PKCE verifier
 * @throws when the response is malformed, the state differs, the provider refuses the code, or the
 *   ID token does not verify
 */
export const redeemCode = (
    configuration: client.Configuration,
    callbackUrl: URL,
    expected: OAuthExpectation
) =>
    client.authorizationCodeGrant(configuration, callbackUrl, {
        expectedState: expected.state,
        pkceCodeVerifier: expected.codeVerifier
    });
