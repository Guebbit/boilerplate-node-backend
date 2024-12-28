import type { Request, Response, NextFunction } from "express";
import {CastError} from "mongoose";
import {databaseErrorConverter} from "../../utils/error-helpers";

/**
 * Page POST data
 */
export interface IPostDeleteCartItemPostData {
    _id: string
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
    req.user!.cartItemRemoveById(req.body._id)
        .then(({success}) => {
            if (!success)
                throw new Error("cartItemRemoveById error");
            return res.redirect('/cart');
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)))