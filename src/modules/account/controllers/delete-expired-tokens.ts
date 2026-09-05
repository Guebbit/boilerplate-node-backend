/**
 * @module
 * `DELETE /account/tokens/expired` controller — thin HTTP adapter over
 * `accountService.adminTokenCleanup`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { accountService } from '../services';
import { authTokenCleanupTotal } from '../metrics';
import { catchAs, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * DELETE /account/tokens/expired
 * Remove all expired tokens from the database (admin only).
 * Useful for periodic cleanup of stale refresh tokens.
 */
export const deleteExpiredTokens = (request: Request, response: Response) => {
    return accountService
        .adminTokenCleanup(callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            authTokenCleanupTotal.inc();
            /*
             * Pruned count stays off the wire: it's for the audit record and logs only. The
             * `Success` response's `MessageResponse` schema forbids `data`, so sending it here
             * would break the contract.
             */
            successResponse<undefined>(response, undefined, result.status, result.message);
        })
        .catch(catchAs(response, 'deleteExpiredTokens'));
};
