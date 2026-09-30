/**
 * @module
 * Cookie service — HTTP cookie creation and destruction, decoupled from JWT logic. Two cookies,
 * two jobs: `jwt` carries the refresh token and is the credential, `isAuth` is a non-secret UI
 * hint so the client shell can render the right chrome before its first request answers. See
 * docs/modules/account-sessions.md for the flag-by-flag rationale.
 */

import type { Response } from 'express';
import { isRelaxedEnvironment } from '@infrastructure/runtime/config';
/**
 * Flags shared by every cookie this module treats as a credential — `createRefreshCookie`,
 * `destroyRefreshCookie`, and (via `../oauth/state.ts` and `../oauth/mfa-redirect.ts`) the
 * OAuth state/verifier/MFA-challenge cookies: unreadable from script (`httpOnly`), HTTPS-only
 * outside development and test (`secure`), confined to same-site navigation (`sameSite: 'lax'`), and sent
 * on every path this app serves (`path: '/'`) since the endpoint that sets one is rarely the
 * endpoint that reads or clears it. A function, not a constant, so each call reads `NODE_ENV`
 * fresh rather than freezing it at import time.
 */
export const secureCookieOptions = () => ({
    httpOnly: true,
    secure: !isRelaxedEnvironment(),
    sameSite: 'lax' as const,
    path: '/'
});

/**
 * Set a secure httpOnly cookie containing the refresh token.
 *
 * @param maxAgeMs - how long the cookie persists, in milliseconds. `undefined` sets a
 *   browser-session cookie (no `Max-Age`/`Expires`): the browser drops it on close, while the
 *   token's own server-side TTL stays the real limit. A rotated token passes its OWN remaining
 *   lifetime, copied forward from the token it replaced rather than any configured tier.
 */
export const createRefreshCookie = (response: Response, token: string, maxAgeMs?: number) => {
    response.cookie('jwt', token, {
        ...secureCookieOptions(),
        // Express: `maxAge` undefined emits no `Max-Age`/`Expires`, i.e. a session cookie.
        // https://expressjs.com/en/api.html#res.cookie
        maxAge: maxAgeMs
    });
};

/**
 * Destroy the refresh token cookie. Must match the flags `createRefreshCookie` set — a browser
 * matches a clear by path/domain/attributes, not by name alone.
 */
export const destroyRefreshCookie = (response: Response) => {
    response.clearCookie('jwt', secureCookieOptions());
};

/**
 * Non-secure UI-hint cookie indicating logged-in state.
 *
 * @param maxAgeMs - milliseconds, or `undefined` for a browser-session cookie — see
 *   `createRefreshCookie`, which this is always set alongside with the same value.
 */
export const createLoggedCookie = (response: Response, maxAgeMs?: number) => {
    response.cookie('isAuth', 'true', {
        // No `httpOnly`/`secure`: this cookie holds no credential, only a hint the client may read.
        maxAge: maxAgeMs,
        sameSite: 'lax',
        path: '/'
    });
};

/**
 * Destroy the logged-in indicator cookie.
 */
export const destroyLoggedCookie = (response: Response) => {
    response.clearCookie('isAuth', {
        path: '/'
    });
};
