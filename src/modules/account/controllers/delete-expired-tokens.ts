import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { accountService } from '../services';
import { authTokenCleanupTotal } from '../metrics';
import { catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * DELETE /account/tokens/expired
 * Remove all expired tokens from the database (admin only).
 * Useful for periodic cleanup of stale refresh tokens.
 */
export const deleteExpiredTokens = (request: Request, response: Response) => {
    /**
     * Remove all expired tokens stored in the server
     */
    return accountService
        .adminTokenCleanup(callerContextOf(request))
        .then(({ status, success }) => {
            if (!success) return rejectResponse(response, status);
            authTokenCleanupTotal.inc();
            return successResponse(response, undefined, status);
        })
        .catch(catchAs(response, 'deleteExpiredTokens'));
};
