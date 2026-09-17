/**
 * @module
 * The one cookie the OAuth 2FA continuation needs: the login challenge `buildLoginChallenge`
 * mints, carried across the provider's redirect instead of in the URL — a live credential in the
 * query string would land in the browser's history and any `Referer`, which
 * `docs/theory/defences/authentication.md#federated-login` already rules out for the redirect
 * itself. `POST /account/login/2fa` and `.../2fa/send` read it whenever their body omits
 * `challenge`, which is how a password-originated login (the challenge is already in the JSON
 * response) and an OAuth-originated one (the challenge is never sent to the client at all) share
 * the same two endpoints.
 */

import type { Request, Response } from 'express';

/** The MFA challenge cookie — single-attempt, cleared once the challenge is spent. */
export const MFA_CHALLENGE_COOKIE = 'oauth_mfa_challenge';

/**
 * Flags shared by every write to {@link MFA_CHALLENGE_COOKIE} — `httpOnly`/`sameSite: 'lax'`
 * mirroring `oauth/state.ts`'s cookies. A function, not a constant, so each call reads `NODE_ENV`
 * fresh rather than freezing it at import time.
 */
const mfaChallengeCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/'
});

/**
 * Set the challenge cookie for one OAuth 2FA continuation. Its lifetime tracks the challenge's
 * OWN expiry — {@link https://expressjs.com/en/5x/api.html#res.cookie set here as `maxAge`} —
 * rather than a fixed value, since a delivered method's challenge lives twice as long as a
 * device one's.
 *
 * @param response - the callback's redirect response
 * @param challenge - the plaintext challenge token from `buildLoginChallenge`
 * @param expiresAt - that same challenge's `expiresAt`, ISO 8601
 */
export const createMfaChallengeCookie = (
    response: Response,
    challenge: string,
    expiresAt: string
): void => {
    const maxAge = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    response.cookie(MFA_CHALLENGE_COOKIE, challenge, { ...mfaChallengeCookieOptions(), maxAge });
};

/** Clear the challenge cookie — called once it has been spent, success or failure. */
export const destroyMfaChallengeCookie = (response: Response): void => {
    response.clearCookie(MFA_CHALLENGE_COOKIE, mfaChallengeCookieOptions());
};

/** The challenge cookie on an incoming request, when one was set. */
export const readMfaChallengeCookie = (request: Request): string | undefined => {
    const cookies = request.cookies as Record<string, string | undefined>;
    return cookies[MFA_CHALLENGE_COOKIE];
};
