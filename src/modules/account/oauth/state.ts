/**
 * @module
 * The CSRF handshake across the OAuth redirect — a double-submit cookie, not a server-side
 * session: the value is minted and handed to the provider (as `state`) in the SAME response that
 * sets it as a cookie, and the callback trusts a request only when the two agree. No new server
 * secret, unlike a signed token would need.
 */

import { randomBytes } from 'node:crypto';
import type { Response } from 'express';

/** The cookie name — cleared by both a successful and a failed callback. */
export const OAUTH_STATE_COOKIE = 'oauth_state';

/** Minutes-scale on purpose: long enough to pick a Google account, short enough to bound reuse. */
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

/** A fresh CSRF token for one login attempt — 128 bits, same entropy `hashToken`'s callers rely on. */
export const generateOAuthState = (): string => randomBytes(16).toString('hex');

/**
 * Set the state cookie for one login attempt. `httpOnly`/`sameSite: 'lax'` mirror
 * `createRefreshCookie`'s flags; `secure` only in production, so local http development still
 * works.
 */
export const createStateCookie = (response: Response, state: string): void => {
    response.cookie(OAUTH_STATE_COOKIE, state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: OAUTH_STATE_TTL_MS,
        path: '/'
    });
};

/** Clear the state cookie — called once a callback has used it, success or failure. */
export const destroyStateCookie = (response: Response): void => {
    response.clearCookie(OAUTH_STATE_COOKIE, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    });
};

/**
 * Whether the callback's `state` query param matches the cookie set at the start of this attempt.
 * Neither side is secret — this defeats a forged callback, not a guessed one — so a plain
 * comparison is enough; nothing here compares a token against a stored secret the way a password
 * check does.
 */
export const stateMatches = (cookieValue: unknown, queryValue: unknown): boolean =>
    typeof cookieValue === 'string' &&
    typeof queryValue === 'string' &&
    cookieValue.length > 0 &&
    cookieValue === queryValue;
