import type { Request, Response, NextFunction } from "express";
import {databaseErrorConverter} from "../../utils/error-helpers";
import type {DatabaseError, ValidationError} from "sequelize";

/**
 * Page POST data
 */
export interface IPostDeleteCartItemPostData {
    id: string,
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
    req.user!.cartItemRemoveById(req.body.id)
        .then(({success}) => {
            if (!success)
                throw new Error("cartItemRemoveById error");
            return res.redirect('/cart');
        })
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))