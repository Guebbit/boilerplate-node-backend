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
    /**
     * Remove all expired tokens stored in the server
     */
    return accountService
        .adminTokenCleanup(callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            authTokenCleanupTotal.inc();
            /*
             * The count stays off the wire. `adminTokenCleanup` reports how many documents it
             * pruned — useful to the audit record and to a log line — but this operation answers
             * with the shared `Success` response, whose `MessageResponse` schema is
             * `additionalProperties: false` and declares no `data`. Sending it would put a key in
             * the body that the contract forbids.
             */
            successResponse(response, undefined, result.status, result.message);
        })
        .catch(catchAs(response, 'deleteExpiredTokens'));
};
