/**
 * @module
 * `GET /account` controller — thin HTTP adapter over `accountService.getOwnProfile`.
 */

import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import type { User } from '@types';
import { userService } from '@modules/users';
import { accountService } from '../services';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs } from '@infrastructure/http/controller';

/**
 * GET /account — the authenticated user's full profile, read fresh from the users collection.
 * The JWT only carries id/email/username/admin; echoing it would silently drop `verifiedAt` and
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
            // A valid token whose row is gone is a dead session, not a server fault. The role
            // comes straight off the already-resolved auth context — it was read from the
            // membership store once already, at token verification, so no second lookup here.
            if (user)
                successResponse<User>(response, userService.toUser(user, authContext.roles.tenant));
            else rejectResponse(response, 401);
        })
        .catch(catchAs(response, 'getAccount'));
};
