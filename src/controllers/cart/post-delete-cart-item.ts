import type { Request, Response, NextFunction } from "express";
import { CastError } from "mongoose";
import { databaseErrorConverter } from "@utils/error-helpers";

/**
 * Page POST data
 */
export interface IPostDeleteCartItemPostData {
    productId: string
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
    request.user!.cartItemRemoveById(request.body.productId)
        .then(({ success }) => {
            if (!success)
                throw new Error("cartItemRemoveById error");
            return response.redirect('/cart');
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)))