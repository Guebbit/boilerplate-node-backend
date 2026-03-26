import type {Request, Response, NextFunction} from 'express';
import Users, {EUserRoles, IToken} from "../models/users";
import {getTokenData} from "../utils/jwt";
import {rejectResponse} from "../utils/response";
import {Types} from "mongoose";

/**
 * Get token (and strip it from "Bearer" prefix)
 * @param req
 */
export const getTokenBearer = (req: Request) => req.header('Authorization')?.split(" ")[1] as IToken['token'] | undefined;

/**
 * Get user data (if authenticated, otherwise go on)
 *
 * @param req
 * @param res
 * @param next
 */
export const getAuth = async (req: Request, res: Response, next: NextFunction) => {
    const token = getTokenBearer(req);

    if (!token) {
        next()
        return;
    }

    await Users.findById((getTokenData(token) as { id: string }).id)
        .then(user => {
            if (user)
                req.user = user;
        })
        .finally(next)
}

/**
 * Unauthorized: Don't know who you are
 *
 * @param req
 * @param res
 * @param next
 */
export const isAuth = (req: Request, res: Response, next: NextFunction) => {
    const token = getTokenBearer(req);

    if (!req.user || !token) {
        rejectResponse(res, 401, "Unauthorized");
        return;
    }

    next()
}

/**
 * Always AFTER isAuth
 *
 * @param role
 */
export const isRole = (role: EUserRoles) =>
    /**
     *
     * @param req
     * @param res
     * @param next
     */
    (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            rejectResponse(res, 403, "Forbidden: Access denied.");
            return;
        }
        if (!req.user.roles.includes(role)) {
            rejectResponse(res, 403, "Forbidden: You don't have permission.");
            return;
        }
        next();
    }



/**
 * Always AFTER isAuth
 *
 * @param req
 * @param res
 * @param next
 */
export const isAdmin = isRole(EUserRoles.ADMIN);

/**
 * Already logged, you shouldn't be here
 *
 * @param req
 * @param res
 * @param next
 */
export const isGuest = (req: Request, res: Response, next: NextFunction) => {
    const token = getTokenBearer(req);
    if (token) {
        rejectResponse(res, 400, "You are already logged in.");
        return;
    }
    next();
}


/**
 * Dynamically add the user id to id parameter.
 * If the user is not logged in, it will be ignored.
 *
 * Useful to just convert /me to /:id (for example)
 *
 * @param req
 * @param res
 * @param next
 */
export const isUser = (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.id)
        req.params.id = (req.user._id as Types.ObjectId).toString();
    next();
}
