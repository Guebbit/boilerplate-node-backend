import type { Request, Response } from 'express';
import { successResponse } from '@utils/response';
import { ETokenType } from '@models/users';
import { destroyLoggedCookie, destroyRefreshCookie } from '@middlewares/auth-jwt';

/**
 * POST /account/logout-all
 * User logout from EVERY device.
 * Remove jwt cookie and ALL refresh tokens in the DB.
 */
export const postLogoutEverywhere = (request: Request, response: Response) => {
    // remove refresh token from DB
    return (
        request.user ? request.user.tokenRemoveAll(ETokenType.REFRESH) : Promise.resolve()
    ).then(() => {
        // and from local
        destroyRefreshCookie(response);
        destroyLoggedCookie(response);

        successResponse(response, undefined, 200, 'Logged out from all devices');
    });
};

