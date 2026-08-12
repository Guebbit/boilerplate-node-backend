import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { userModel as Users } from '@modules/users';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { authTokenCleanupTotal } from '../metrics';

/**
 * DELETE /account/tokens/expired
 * Remove all expired tokens from the database (admin only).
 * Useful for periodic cleanup of stale refresh tokens.
 */
export const deleteExpiredTokens = (request: Request, response: Response) => {
    /**
     * Remove all expired tokens stored in the server
     */
    return Users.tokenRemoveExpired()
        .then(({ status, success }) => {
            if (!success) return rejectResponse(response, status);
            authTokenCleanupTotal.inc();
            emitAuditEvent(
                buildAuditEvent(request, {
                    action: accountAuditActions.AUTH_TOKEN_EXPIRED_CLEANUP,
                    outcome: 'success'
                })
            );
            return successResponse(response, undefined, status);
        })
        .catch((error: CastError | Error) =>
            rejectDatabaseError(response, 'deleteExpiredTokens', error)
        );
};
