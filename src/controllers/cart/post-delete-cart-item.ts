import type { Request, Response, NextFunction } from "express";
import { databaseErrorConverter } from "../../utils/error-helpers";
import type { DatabaseError, ValidationError } from "sequelize";

/**
 * Page POST data
 */
export interface IPostDeleteCartItemPostData {
    id: string,
}

/**
 * Delete target cart item
 *
 * @param request
 * @param response
 * @param next
 */
export const postDeleteCartItem = (request: Request<unknown, unknown, IPostDeleteCartItemPostData>, response: Response, next: NextFunction) =>
    // check done before entering the route
    request.user!.cartItemRemoveById(request.body.id)
        .then(({ success }) => {
            if (!success)
                throw new Error("cartItemRemoveById error");
            return response.redirect('/cart');
        })
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))