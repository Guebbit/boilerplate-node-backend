import type { Request, Response } from 'express';
import {successResponse} from "../../utils/response";
import {getTokenBearer} from "../../middlewares/authorizations";
import {destroyLoggedCookie, destroyRefreshCookie} from "../../utils/jwt";

/**
 * User logout
 * Remove jwt cookie and current refresh token in the DB
 *
 * @param req
 * @param res
 */
export default async (req: Request, res: Response) => {
    const token = getTokenBearer(req);
    //remove current token from DB
    if(req.user && token)
        await req.user.tokenRemove(token);
    // and from local
    destroyRefreshCookie(res);
    destroyLoggedCookie(res);

    successResponse(res);
}