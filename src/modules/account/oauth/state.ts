/**
 * @module
 * The two per-attempt cookies an OAuth login needs before it ever leaves for the provider:
 * `state`, the CSRF handshake — a double-submit cookie, not a server-side session: the value is
 * minted and handed to the provider in the SAME response that sets it as a cookie, and the
 * callback trusts a request only when the two agree; and the PKCE `verifier`, which defeats a
 * stolen authorization CODE the way `state` defeats a forged CALLBACK — see
 * `docs/theory/defences/authentication.md#federated-login` for why both ship. Neither needs a new
 * server secret, unlike a signed token would.
 */

import { randomBytes, createHash } from 'node:crypto';
import type { Response } from 'express';
import { secureCookieOptions } from '../session/cookies';

/** The CSRF cookie — cleared by both a successful and a failed callback. */
export const OAUTH_STATE_COOKIE = 'oauth_state';

/** The PKCE verifier cookie — same lifetime and clearing points as {@link OAUTH_STATE_COOKIE}. */
export const OAUTH_VERIFIER_COOKIE = 'oauth_verifier';

/** Minutes-scale on purpose: long enough to pick a Google account, short enough to bound reuse. */
const OAUTH_COOKIE_TTL_MS = 5 * 60 * 1000;

/** A fresh CSRF token for one login attempt — 128 bits, same entropy `hashToken`'s callers rely on. */
export const generateOAuthState = (): string => randomBytes(16).toString('hex');

/**
 * A fresh PKCE verifier for one login attempt — RFC 7636 §4.1 asks for 43-128 characters from an
 * unreserved-character alphabet; 32 random bytes base64url-encoded gives 43 with no padding.
 * https://www.rfc-editor.org/rfc/rfc7636#section-4.1
 */
export const generateCodeVerifier = (): string => randomBytes(32).toString('base64url');

/**
 * RFC 7636 §4.2's S256 transform — what this app sends the provider as `code_challenge`, and what
 * the provider re-derives from the `code_verifier` it is handed back at redemption.
 * https://www.rfc-editor.org/rfc/rfc7636#section-4.2
 */
export const codeChallengeOf = (verifier: string): string =>
    createHash('sha256').update(verifier).digest('base64url');

/**
 * Flags shared by both OAuth cookies — `secureCookieOptions()` plus this attempt's own TTL.
 */
const oauthCookieOptions = () => ({
    ...secureCookieOptions(),
    maxAge: OAUTH_COOKIE_TTL_MS
});

/** Set the state cookie for one login attempt. */
export const createStateCookie = (response: Response, state: string): void => {
    response.cookie(OAUTH_STATE_COOKIE, state, oauthCookieOptions());
};

/** Clear the state cookie — called once a callback has used it, success or failure. */
export const destroyStateCookie = (response: Response): void => {
    response.clearCookie(OAUTH_STATE_COOKIE, oauthCookieOptions());
};

/** Set the PKCE verifier cookie for one login attempt. */
export const createVerifierCookie = (response: Response, verifier: string): void => {
    response.cookie(OAUTH_VERIFIER_COOKIE, verifier, oauthCookieOptions());
};

/** Clear the verifier cookie — called at every point {@link destroyStateCookie} is. */
export const destroyVerifierCookie = (response: Response): void => {
    response.clearCookie(OAUTH_VERIFIER_COOKIE, oauthCookieOptions());
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
