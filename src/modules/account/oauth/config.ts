/**
 * @module
 * OAuth configuration — env var access, in one place so `./providers/*` and the controllers never
 * spell a `process.env.NODE_OAUTH_*` name themselves. Named `config.ts` like `../session/config`:
 * it reads policy, it doesn't hold or mint anything.
 */

/** One provider's client credentials, absent when a deployment never set them. */
export interface OAuthCredentials {
    clientId?: string;
    clientSecret?: string;
}

/**
 * A provider's `NODE_OAUTH_<NAME>_CLIENT_ID`/`_CLIENT_SECRET` pair.
 *
 * @param name - the registry key (`'google'`, `'github'`), upper-cased to build the var names
 */
export const getOAuthCredentials = (name: string): OAuthCredentials => {
    const key = name.toUpperCase();
    return {
        clientId: process.env[`NODE_OAUTH_${key}_CLIENT_ID`],
        clientSecret: process.env[`NODE_OAUTH_${key}_CLIENT_SECRET`]
    };
};

/** Whether BOTH halves of a provider's credentials are set — the registry's "configured" check. */
export const isOAuthProviderConfigured = (name: string): boolean => {
    const { clientId, clientSecret } = getOAuthCredentials(name);
    return !!clientId && !!clientSecret;
};

/**
 * The redirect URI this app presents to every provider for `provider` — always derived from
 * `NODE_URL`, NEVER from the request. A request-supplied redirect target is an open-redirect /
 * callback-confusion vector; deriving it here, the one place both the start and callback
 * controllers read it from, is what keeps that true.
 *
 * @param provider - the registry key, matching `GET /account/oauth/:provider`'s route param
 */
export const oauthRedirectUri = (provider: string): string =>
    `${process.env.NODE_URL ?? ''}account/oauth/${provider}/callback`;

/** The paired frontend's origin — where a finished (or failed) login lands the browser back. */
export const getFrontendUrl = (): string =>
    process.env.NODE_FRONTEND_URL ?? 'http://localhost:8080';

/** Where `GET /account/oauth/:provider/callback` sends the browser once it is done. */
export const oauthFrontendCallbackUrl = (errorCode?: string): string =>
    `${getFrontendUrl()}/oauth/callback${errorCode ? `?error=${errorCode}` : ''}`;
