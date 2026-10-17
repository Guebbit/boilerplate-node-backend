/**
 * @module
 * The refresh exchange — a refresh token for a fresh access token, rotated and audited.
 * The rotation itself is `../session/jwt`.
 */

import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { authRefreshReuseTotal } from '../metrics';
import {
    rotateRefreshToken,
    TokenReuseError,
    TokenRejection,
    type RotatedSession
} from '../session/jwt';

/**
 * The absence of a refresh cookie, as an error, so that the one `catch` below can tell the two
 * failures apart without the happy path having to branch on the token twice.
 */
class MissingRefreshTokenError extends Error {
    /** No arguments: the cookie's absence is the whole fact. */
    constructor() {
        super('Refresh token missing');
        this.name = 'MissingRefreshTokenError';
    }
}

/** Why a refresh that was not a reuse failed, as the audit row names it. */
const failureReason = (error: unknown): string => {
    if (error instanceof MissingRefreshTokenError) return 'missing_token';
    if (error instanceof TokenRejection && error.reason === 'idle') return 'session_idle';
    return 'invalid_token';
};

/**
 * Exchange a refresh token for a fresh access token, ROTATING the refresh token in the same
 * breath, and recording the attempt either way. Takes the cookie as
 * found, absence included, so all three ordinary outcomes — missing, invalid, valid — are decided
 * and recorded here; a fourth, reuse of an already-rotated token, gets its own audit action and
 * `metadata.reason` rather than being folded into `invalid_token`, since it is a materially
 * different fact for whoever reads the trail: not a caller with a stale cookie, but a token value
 * that outlived the session it belonged to.
 * @returns the new access/refresh tokens and the refresh cookie's new `maxAge`, for the
 *   controller to set alongside the response
 */
export const refreshAccessToken = (
    refreshToken: string | undefined,
    context: CallerContext
): Promise<RotatedSession> =>
    (refreshToken
        ? rotateRefreshToken(refreshToken)
        : Promise.reject(new MissingRefreshTokenError())
    )
        .then((result) => {
            recordAudit(context, {
                action: accountAuditActions.AUTH_TOKEN_REFRESHED,
                outcome: 'success'
            });
            return result;
        })
        .catch((error: unknown) => {
            const reuseDetected = error instanceof TokenReuseError;
            if (reuseDetected) authRefreshReuseTotal.inc();

            recordAudit(context, {
                action: reuseDetected
                    ? accountAuditActions.AUTH_REFRESH_TOKEN_REUSE_DETECTED
                    : accountAuditActions.AUTH_TOKEN_REFRESHED,
                // The reuse case DOES know whose account this was — carry the id, unlike the
                // ordinary failures below, which never got far enough to find out. `actorRole`
                // is left to its default (`anonymous`): this request never carried a verified
                // access token, so admin status isn't cheaply known, and getting it wrong would
                // misreport a fact the id alone already establishes precisely.
                actorUserId: reuseDetected ? error.userId : 'anonymous',
                outcome: 'failure',
                ...(reuseDetected
                    ? {}
                    : {
                          metadata: {
                              reason: failureReason(error)
                          }
                      })
            });
            throw error;
        });
