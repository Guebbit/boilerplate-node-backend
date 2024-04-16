import type { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import { ExtendedError } from "../../utils/error-helpers";

/**
 * Page POST data
 */
export interface IPostDeleteCartItemPostData {
    _id: string,
}

/**
 * Delete target cart item
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request<unknown, unknown, IPostDeleteCartItemPostData>, res: Response, next: NextFunction) =>
    // check done before entering the route
    req.user!.cartItemRemove(req.body._id)
        .then(() => res.redirect('/cart'))
        .catch((error: CastError) =>
            next(new ExtendedError(error.kind, parseInt(error.message), "", false)))