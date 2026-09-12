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
 * Built through `URL` rather than concatenated, because this one has to be ABSOLUTE — a provider
 * rejects a relative `redirect_uri`, and so does `new URL()` in anything that parses our own
 * `Location` back. Concatenation made that depend on `NODE_URL` carrying a trailing slash:
 * `https://api.example.com` with no slash produced `https://api.example.comaccount/oauth/…`, and
 * `NODE_URL` unset produced a path with no leading slash. `URL` resolves both. The localhost
 * fallback matches `oauthFrontendCallbackUrl` below and only ever applies where the boot-time
 * `NODE_URL` check is skipped — which is `NODE_ENV=test`, and nothing else
 * (`kernel/required-config.ts`).
 *
 * @param provider - the registry key, matching `GET /account/oauth/:provider`'s route param
 */
export const oauthRedirectUri = (provider: string): string =>
    new URL(`account/oauth/${provider}/callback`, process.env.NODE_URL ?? 'http://localhost:3000/')
        .href;

/**
 * Where `GET /account/oauth/:provider/callback` sends the browser once it is done — the paired
 * frontend's origin, which is the only thing `NODE_FRONTEND_URL` is read for.
 */
export const oauthFrontendCallbackUrl = (errorCode?: string): string =>
    `${process.env.NODE_FRONTEND_URL ?? 'http://localhost:8080'}/oauth/callback${
        errorCode ? `?error=${errorCode}` : ''
    }`;
