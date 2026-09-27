/**
 * @module
 * OAuth configuration — env var access, in one place so `./providers/*` and the controllers never
 * spell a `process.env.NODE_OAUTH_*` name themselves. Named `config.ts` like `../session/config`:
 * it reads policy, it doesn't hold or mint anything.
 */

import type { MfaChallenge } from '@types';

/**
 * How long a provider's own HTTP calls (token exchange, and GitHub's profile/email follow-ups)
 * are allowed before this app gives up — one shared value so an unresponsive provider cannot hold
 * an OAuth callback, and so `./providers/*` never picks its own number. `AbortSignal.timeout`
 * wraps the whole outbound attempt, the same pattern `antibot-providers/turnstile.ts` and
 * `webhooks/transport/webhook-delivery.ts` already use.
 * https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static
 */
export const OAUTH_FETCH_TIMEOUT_MS = 5000;

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
 * Joins `path` onto this app's own `NODE_URL`, ABSOLUTE — a provider rejects a relative
 * `redirect_uri`, and so does `new URL()` in anything that parses our own `Location` back.
 * Concatenation made that depend on `NODE_URL` carrying a trailing slash:
 * `https://api.example.com` with no slash produced `https://api.example.comaccount/oauth/…`, and
 * `NODE_URL` unset produced a path with no leading slash. `URL` resolves both. The localhost
 * fallback only ever applies where the boot-time `NODE_URL` check is skipped — which is
 * `NODE_ENV=test`, and nothing else (`kernel/required-config.ts`).
 *
 * @param path - relative to `NODE_URL`, no leading slash
 */
const backendUrl = (path: string): string =>
    new URL(path, process.env.NODE_URL ?? 'http://localhost:3000/').href;

/**
 * The redirect URI this app presents to every provider for `provider` — always derived from
 * `NODE_URL`, NEVER from the request. A request-supplied redirect target is an open-redirect /
 * callback-confusion vector; deriving it here, the one place both the start and callback
 * controllers read it from, is what keeps that true.
 *
 * @param provider - the registry key, matching `GET /account/oauth/:provider`'s route param
 */
export const oauthRedirectUri = (provider: string): string =>
    backendUrl(`account/oauth/${provider}/callback`);

/** The paired frontend's OAuth landing page — everything below appends its own query to this. */
const oauthFrontendCallbackBase = (): string =>
    `${process.env.NODE_FRONTEND_URL ?? 'http://localhost:8080'}/oauth/callback`;

/**
 * Where `GET /account/oauth/:provider/callback` sends the browser once it is done — the paired
 * frontend's ORIGIN is the only part `NODE_FRONTEND_URL` supplies; `continueTo` is the one
 * request-derived piece of this URL, so callers must only ever pass a value already checked
 * against `oauth/state.ts#isSameOriginPath` — never the raw cookie or query param.
 *
 * @param continueTo - the saved `?continue=` target, forwarded as-is so the frontend's own
 *   `usePostLoginRedirect` can send the browser on from its landing page, exactly as it already
 *   does for a password login's `?continue=`.
 */
export const oauthFrontendCallbackUrl = (errorCode?: string, continueTo?: string): string => {
    const parameters = new URLSearchParams();
    if (errorCode) parameters.set('error', errorCode);
    if (continueTo) parameters.set('continue', continueTo);

    const query = parameters.toString();
    return `${oauthFrontendCallbackBase()}${query ? `?${query}` : ''}`;
};

/**
 * Where the callback sends the browser when the account has 2FA armed. Everything a client needs
 * to RENDER the 2FA step travels here — none of it secret — while the challenge token itself
 * travels in `MFA_CHALLENGE_COOKIE` instead; see `oauth/mfa-redirect.ts`.
 *
 * @param challenge - `buildLoginChallenge`'s result, minus the token — never pass the whole
 *   `MfaChallenge` through unchecked, or a future refactor could serialize the token into the URL
 *   this function exists to keep it out of.
 * @param continueTo - the saved `?continue=` target, already validated by the caller — see
 *   {@link oauthFrontendCallbackUrl}. The frontend's 2FA step forwards it on again once the
 *   challenge is answered, so the redirect a plain login would have landed on still happens.
 */
export const oauthFrontendMfaCallbackUrl = (
    challenge: Omit<MfaChallenge, 'mfaRequired' | 'challenge'>,
    continueTo?: string
): string => {
    const parameters = new URLSearchParams({
        mfaRequired: '1',
        expiresAt: challenge.expiresAt,
        methods: JSON.stringify(challenge.methods)
    });
    if (challenge.defaultMethod) parameters.set('defaultMethod', challenge.defaultMethod);
    if (continueTo) parameters.set('continue', continueTo);

    return `${oauthFrontendCallbackBase()}?${parameters.toString()}`;
};
