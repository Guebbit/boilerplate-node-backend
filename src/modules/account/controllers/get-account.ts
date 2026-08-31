/**
 * @module
 * `GET /account` controller — thin HTTP adapter over `accountService.getOwnProfile`.
 */

import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { accountService } from '../services';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * GET /account — the authenticated user's full profile, read fresh from the users collection.
 * The JWT only carries id/email/username/admin; echoing it would silently drop `verified` and
 * `locale`, which the client's verify banner and saved-language flow need.
 */
export const getAccount = (request: Request, response: Response): void => {
    const { authContext } = request;
    if (!authContext) {
        rejectResponse(response, 401);
        return;
    }
    accountService
        .getOwnProfile(authContext.id, callerContextOf(request))
        .then((user) => {
            // A valid token whose row is gone is a dead session, not a server fault.
            if (user) successResponse(response, user);
            else rejectResponse(response, 401);
        })
        .catch(() => rejectResponse(response, 500));
};
