/**
 * @module
 * GitHub OAuth — plain OAuth2, no ID token. The identity needs two calls after the code exchange:
 * `/user` for the profile, `/user/emails` because a primary email can be marked private and then
 * never appears on `/user` at all.
 */

import { getOAuthCredentials, isOAuthProviderConfigured } from '../config';
import type { OAuthIdentity, OAuthProvider } from './port';

/** This registry's key — lands on `OAuthAccount.provider`. */
const PROVIDER_NAME = 'github';

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

/** Whether both `NODE_OAUTH_GITHUB_CLIENT_ID`/`_CLIENT_SECRET` are set. */
export const githubConfigured = (): boolean => isOAuthProviderConfigured(PROVIDER_NAME);

/**
 * GitHub's REST API: a bearer call, versioned by the `Accept` header rather than a URL segment.
 * https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api
 */
const githubApiGet = <T>(path: string, accessToken: string): Promise<T> =>
    fetch(`https://api.github.com${path}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json'
        }
    }).then((response) => {
        if (!response.ok) throw new Error(`GitHub API ${path} failed: ${response.status}`);
        return response.json() as Promise<T>;
    });

export const githubOAuthProvider: OAuthProvider = {
    name: PROVIDER_NAME,

    authorizeUrl: (state, redirectUri) => {
        const { clientId } = getOAuthCredentials(PROVIDER_NAME);
        // https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
        const query = new URLSearchParams({
            client_id: clientId ?? '',
            redirect_uri: redirectUri,
            scope: 'read:user user:email',
            state
        });
        return `https://github.com/login/oauth/authorize?${query.toString()}`;
    },

    exchangeCode: (code, redirectUri) => {
        const { clientId, clientSecret } = getOAuthCredentials(PROVIDER_NAME);
        // https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#2-users-are-redirected-back-to-your-site-by-github
        // `Accept: application/json` — GitHub answers form-encoded by default; this asks for JSON instead.
        return fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json'
            },
            body: new URLSearchParams({
                code,
                client_id: clientId ?? '',
                client_secret: clientSecret ?? '',
                redirect_uri: redirectUri
            })
        })
            .then((response) => {
                if (!response.ok)
                    throw new Error(`GitHub token exchange failed: ${response.status}`);
                return response.json() as Promise<{ access_token?: string; error?: string }>;
            })
            .then(({ access_token: accessToken, error }) => {
                if (!accessToken || error)
                    throw new Error(
                        `GitHub token exchange: ${error ?? 'no access_token in response'}`
                    );

                return Promise.all([
                    githubApiGet<GithubUser>('/user', accessToken),
                    githubApiGet<GithubEmail[]>('/user/emails', accessToken)
                ]);
            })
            .then(([user, emails]): OAuthIdentity => {
                // The primary is the one address that identifies the account; a non-primary
                // verified address is not the same claim — see the port's `emailVerified` doc.
                const primary = emails.find((entry) => entry.primary);
                if (!primary) throw new Error('GitHub token exchange: no primary email visible');

                return {
                    providerId: String(user.id),
                    email: primary.email,
                    emailVerified: primary.verified,
                    name: user.name ?? user.login,
                    imageUrl: user.avatar_url
                };
            });
    }
};
