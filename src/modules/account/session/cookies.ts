/**
 * @module
 * Cookie service — HTTP cookie creation and destruction, decoupled from JWT logic. Two cookies,
 * two jobs: `jwt` carries the refresh token and is the credential, `isAuth` is a non-secret UI
 * hint so the client shell can render the right chrome before its first request answers. See
 * docs/modules/account-sessions.md for the flag-by-flag rationale.
 */

import type { Response } from 'express';
import { type RefreshTokenExpiryTime, getExpiryTimeMilliseconds } from './config';

/**
 * Flags shared by every cookie this module treats as a credential — `createRefreshCookie`,
 * `destroyRefreshCookie`, and (via `../oauth/state.ts` and `../oauth/mfa-redirect.ts`) the
 * OAuth state/verifier/MFA-challenge cookies: unreadable from script (`httpOnly`), HTTPS-only
 * once in production (`secure`), confined to same-site navigation (`sameSite: 'lax'`), and sent
 * on every path this app serves (`path: '/'`) since the endpoint that sets one is rarely the
 * endpoint that reads or clears it. A function, not a constant, so each call reads `NODE_ENV`
 * fresh rather than freezing it at import time.
 */
export const secureCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/'
});

/**
 * Set a secure httpOnly cookie containing the refresh token.
 *
 * @param remember - a tier (looked up against env), OR a raw `maxAge` in milliseconds — a
 *   rotated token carries its OWN remaining lifetime, copied
 *   forward from the token it replaced rather than any configured tier.
 */
export const createRefreshCookie = (
    response: Response,
    token: string,
    remember?: RefreshTokenExpiryTime | number
) => {
    response.cookie('jwt', token, {
        ...secureCookieOptions(),
        // Expires when the token does, rather than outliving it.
        maxAge: typeof remember === 'number' ? remember : getExpiryTimeMilliseconds(remember)
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
 * @param remember - a tier, or a raw `maxAge` in milliseconds — see `createRefreshCookie`, which
 *   this is always set alongside with the same value.
 */
export const createLoggedCookie = (
    response: Response,
    remember?: RefreshTokenExpiryTime | number
) => {
    response.cookie('isAuth', 'true', {
        // No `httpOnly`/`secure`: this cookie holds no credential, only a hint the client may read.
        maxAge: typeof remember === 'number' ? remember : getExpiryTimeMilliseconds(remember),
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
