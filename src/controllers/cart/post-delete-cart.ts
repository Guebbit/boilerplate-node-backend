import type {Request, Response, NextFunction} from "express";
import type {CastError} from "mongoose";
import { databaseErrorConverter } from "../../utils/error-helpers";

/**
 * Remove ALL items in the user cart
 *
 * @param request
 * @param response
 * @param next
 */
export const postDeleteCart = (request: Request, response: Response, next: NextFunction) =>
    // check done before entering the route
    request.user!.cartRemove()
        .then(({success}) => {
            if (!success)
                throw new Error("cartRemove error");
            return response.redirect('/cart');
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));