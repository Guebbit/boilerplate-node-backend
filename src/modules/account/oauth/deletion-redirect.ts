/**
 * @module
 * The one cookie the OAuth deletion-grace continuation needs: the claim check
 * `buildDeletionPending` mints, carried across the provider's redirect instead of in the URL,
 * for the same reason `./mfa-redirect.ts` carries the 2FA challenge there. `POST
 * /account/login/restore` reads it whenever its body omits `challenge`.
 */

import type { Request, Response } from 'express';
import { cookieOf } from '@infrastructure/http/cookies';
import { hostCookieOptions } from '../session/cookies';

/** The deletion-restore claim-check cookie — cleared once the check is spent. */
const DELETION_CHALLENGE_COOKIE = '__Host-oauth_deletion_challenge';

/**
 * Set the claim-check cookie for one OAuth sign-in. Its lifetime tracks the check's own expiry.
 *
 * @param response - the callback's redirect response
 * @param challenge - the plaintext claim check from `buildDeletionPending`
 * @param expiresAt - that same check's `expiresAt`, ISO 8601
 */
export const createDeletionChallengeCookie = (
    response: Response,
    challenge: string,
    expiresAt: string
): void => {
    const maxAge = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    response.cookie(DELETION_CHALLENGE_COOKIE, challenge, { ...hostCookieOptions(), maxAge });
};

/** Clear the claim-check cookie — called once it has been spent. */
export const destroyDeletionChallengeCookie = (response: Response): void => {
    response.clearCookie(DELETION_CHALLENGE_COOKIE, hostCookieOptions());
};

/** The claim-check cookie on an incoming request, when one was set. */
export const readDeletionChallengeCookie = (request: Request): string | undefined =>
    cookieOf(request, DELETION_CHALLENGE_COOKIE);
