import type {Request, Response} from 'express';
import {successResponse} from "@utils/response";
import {ETokenType} from "@models/users";
import {destroyLoggedCookie, destroyRefreshCookie} from "@middlewares/auth-jwt";

/**
 * User logout from EVERY device
 * Remove jwt cookie and ALL refresh tokens in the DB
 *
 * @param req
 * @param res
 */
export default async (req: Request, res: Response) => {
    //remove refresh token from DB
    if(req.user)
        await req.user.tokenRemoveAll(ETokenType.REFRESH);
    // and from local
    destroyRefreshCookie(res);
    destroyLoggedCookie(res);

    successResponse(res, undefined, 200, 'Logged out from all devices');
}
