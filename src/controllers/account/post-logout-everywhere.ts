import type { Request, Response } from 'express';
import { successResponse } from '@utils/response';
import { ETokenType } from '@models/users';
import { destroyLoggedCookie, destroyRefreshCookie } from '@middlewares/auth-jwt';

/**
 * User logout from EVERY device
 * Remove jwt cookie and ALL refresh tokens in the DB
 *
 * @param request
 * @param response
 */
const postLogoutEverywhere = async (request: Request, response: Response) => {
    //remove refresh token from DB
    if (request.user)
        await request.user.tokenRemoveAll(ETokenType.REFRESH);
    // and from local
    destroyRefreshCookie(response);
    destroyLoggedCookie(response);

    successResponse(response, undefined, 200, 'Logged out from all devices');
}

export default postLogoutEverywhere;
