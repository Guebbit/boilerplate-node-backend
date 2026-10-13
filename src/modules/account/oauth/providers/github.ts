/**
 * @module
 * GitHub OAuth — plain OAuth2, no ID token. The identity needs two calls after the code exchange:
 * `/user` for the profile, `/user/emails` because a primary email can be marked private and then
 * never appears on `/user` at all.
 */

import type * as client from 'openid-client';
import { readCappedJson, DEFAULT_BODY_CAP_BYTES } from '@infrastructure/http/read-capped-body';
import { OAUTH_FETCH_TIMEOUT_MS } from '../config';
import type { OAuthIdentity, OAuthProvider } from './port';
import { authorizationUrlFor, configurationFor, redeemCode } from './client';

/** This registry's key — lands on `OAuthAccount.provider`. */
const PROVIDER_NAME = 'github';

/**
 * GitHub's OAuth endpoints, written down rather than discovered. GitHub is plain OAuth 2.0 and
 * publishes no issuer or key set, so `issuer` is only a label the library requires; no ID token is
 * ever expected.
 * https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
 */
const SERVER: client.ServerMetadata = {
    issuer: 'https://github.com',
    authorization_endpoint: 'https://github.com/login/oauth/authorize',
    token_endpoint: 'https://github.com/login/oauth/access_token'
};

/** The one profile field this app reads off `GET /user`. */
interface GithubUser {
    id: number;
    login: string;
    name?: string | null;
    avatar_url?: string;
}

/** One entry of `GET /user/emails`. */
interface GithubEmail {
    email: string;
    primary: boolean;
    verified: boolean;
}

/**
 * GitHub's REST API: a bearer call, versioned by the `Accept` header rather than a URL segment.
 * https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api
 */
const githubApiGet = <T>(path: string, accessToken: string): Promise<T> =>
    fetch(`https://api.github.com${path}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json'
        },
        // Node: abort rather than hold an OAuth callback open on a slow/hung GitHub.
        signal: AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS),
        // fetch: a redirect is an error, not something to follow to a host nobody chose.
        redirect: 'error'
    }).then((response) => {
        if (!response.ok) throw new Error(`GitHub API ${path} failed: ${response.status}`);
        // The type argument is an annotation, not a check: callers narrow what they read.
        return readCappedJson(response, DEFAULT_BODY_CAP_BYTES) as Promise<T>;
    });

/**
 * What this app reads off the two profile calls, once the shapes are known. Written as a check
 * rather than a cast: a malformed or future-shaped `/user` answer would otherwise pass
 * `String(undefined)` through as the literal providerId `"undefined"`, colliding every affected
 * account onto one identity row.
 *
 * @param user - the `/user` answer
 * @param emails - the `/user/emails` answer
 * @throws {Error} when the profile carries no numeric id, or no email is marked primary
 */
const identityOf = (user: GithubUser, emails: GithubEmail[]): OAuthIdentity => {
    if (typeof user.id !== 'number')
        throw new Error('GitHub token exchange: profile response carries no id');

    // The primary is the one address that identifies the account; a non-primary verified
    // address is not the same claim — see the port's `emailVerified` doc.
    const primary = emails.find((entry) => entry.primary);
    if (!primary) throw new Error('GitHub token exchange: no primary email visible');

    return {
        providerId: String(user.id),
        email: primary.email,
        emailVerified: primary.verified,
        name: user.name ?? user.login,
        imageUrl: user.avatar_url
    };
};

/**
 * GitHub behind the OAuth port. Its identity comes from two calls, not one token: GitHub's
 * `/user` omits a private address, so `/user/emails` supplies the verified primary. The code
 * exchange itself is the library's, which also refuses GitHub's habit of answering a failed
 * exchange with HTTP 200 and an `error` body.
 */
export const githubOAuthProvider: OAuthProvider = {
    name: PROVIDER_NAME,

    // https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
    // PKCE (RFC 7636), supported by GitHub since July 2025.
    // https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/
    authorizeUrl: (state, redirectUri, codeChallenge) =>
        authorizationUrlFor(configurationFor(PROVIDER_NAME, SERVER), {
            redirectUri,
            scope: 'read:user user:email',
            state,
            codeChallenge
        }),

    exchangeCode: (callbackUrl, expected) =>
        redeemCode(configurationFor(PROVIDER_NAME, SERVER), callbackUrl, expected)
            .then(({ access_token: accessToken }) =>
                Promise.all([
                    githubApiGet<GithubUser>('/user', accessToken),
                    githubApiGet<GithubEmail[]>('/user/emails', accessToken)
                ])
            )
            .then(([user, emails]) => identityOf(user, emails))
};
