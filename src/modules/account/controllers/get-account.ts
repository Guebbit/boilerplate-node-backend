/**
 * @module
 * `GET /account` controller — thin HTTP adapter over `accountService.getOwnProfile`.
 */

import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import type { AccountView } from '@types';
import { accountService } from '../services';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs } from '@infrastructure/http/controller';
import { setEtag } from '@infrastructure/http/preconditions';
import { accountViewOf } from '../session/account-view';

/**
 * GET /account — the authenticated user's full profile, read fresh from the users collection.
 * The JWT only carries id/email/username/admin; echoing it would silently drop `verifiedAt` and
 * `locale`, which the client's verify banner and saved-language flow need. It also carries the
 * caller's abilities and idle clock, so a signed-in reload needs no second call.
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
            if (!user) {
                rejectResponse(response, 401);
                return;
            }
            // The version a profile edit sends back as `If-Match`: over the stored document, not
            // the body, so a role change never turns an earlier read's `If-Match` into a 412.
            setEtag(response, user);
            successResponse<AccountView>(response, accountViewOf(user, authContext));
        })
        .catch(catchAs(response, 'getAccount'));
};
