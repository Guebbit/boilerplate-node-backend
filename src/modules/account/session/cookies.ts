/**
 * @module
 * Cookie service — HTTP cookie creation and destruction, decoupled from how a session is kept. Two
 * cookies, two jobs: `__Host-session` carries the credential (the refresh token in `jwt` mode, the
 * session id in `cookie` mode), `isAuth` is a non-secret UI hint so the client shell can render
 * the right chrome before its first request answers. See docs/modules/account-sessions.md for the
 * flag-by-flag rationale.
 */

import type { Response } from 'express';
import { SESSION_COOKIE } from '@kernel/cookies';
import { isRelaxedEnvironment } from '@infrastructure/runtime/config';

/**
 * Flags shared by every cookie this module treats as a credential — `createSessionCookie`,
 * `destroySessionCookie`, and (via `../oauth/state.ts` and `../oauth/mfa-redirect.ts`) the
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
 * The session cookie's flags: {@link secureCookieOptions} with `Secure` forced on in every
 * environment, which the `__Host-` prefix requires. Browsers accept `Secure` cookies from
 * `http://localhost`, so a developer machine is unaffected; a LAN-IP dev over plain HTTP is not,
 * and would need HTTPS or a hostname that is not an address.
 */
const hostCookieOptions = () => ({ ...secureCookieOptions(), secure: true });

/**
 * Set the secure httpOnly session cookie.
 *
 * @param credential - the refresh token (`jwt` mode) or the `ses_…` id (`cookie` mode)
 * @param maxAgeMs - how long the cookie persists, in milliseconds. `undefined` sets a
 *   browser-session cookie (no `Max-Age`/`Expires`): the browser drops it on close, while the
 *   session's own server-side TTL stays the real limit. A rotated token passes its OWN remaining
 *   lifetime, copied forward from the token it replaced rather than any configured tier.
 */
export const createSessionCookie = (response: Response, credential: string, maxAgeMs?: number) => {
    response.cookie(SESSION_COOKIE, credential, {
        ...hostCookieOptions(),
        // Express: `maxAge` undefined emits no `Max-Age`/`Expires`, i.e. a session cookie.
        // https://expressjs.com/en/api.html#res.cookie
        maxAge: maxAgeMs
    });
};

/**
 * Destroy the session cookie. Must match the flags `createSessionCookie` set — a browser matches a
 * clear by path/domain/attributes, not by name alone.
 */
export const destroySessionCookie = (response: Response) => {
    response.clearCookie(SESSION_COOKIE, hostCookieOptions());
};

/**
 * Non-secure UI-hint cookie indicating logged-in state.
 *
 * @param maxAgeMs - milliseconds, or `undefined` for a browser-session cookie — see
 *   `createSessionCookie`, which this is always set alongside with the same value.
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
