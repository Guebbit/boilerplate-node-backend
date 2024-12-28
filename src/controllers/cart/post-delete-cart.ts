import type {Request, Response, NextFunction} from "express";
import type {CastError} from "mongoose";
import {databaseErrorConverter} from "../../utils/error-helpers";

/**
 * Remove ALL items in the user cart
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request, res: Response, next: NextFunction) =>
    // check done before entering the route
    req.user!.cartRemove()
        .then(({success}) => {
            if (!success)
                throw new Error("cartRemove error");
            return res.redirect('/cart');
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));