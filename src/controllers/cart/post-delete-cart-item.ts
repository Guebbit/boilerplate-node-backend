import type { Request, Response, NextFunction } from "express";
import { CastError } from "mongoose";
import { databaseErrorConverter } from "@utils/error-helpers";
import { successResponse } from "@utils/response";
import UserService from "@services/users";

/**
 * Path parameters for cart item by productId
 */
export interface IDeleteCartItemParams {
    productId: string;
}

/**
 * Delete target cart item
 * DELETE /cart/:productId
 *
 * @param request
 * @param response
 * @param next
 */
export const postDeleteCartItem = (request: Request<IDeleteCartItemParams>, response: Response, next: NextFunction) =>
    // isAuth ensures request.user is set
    UserService.cartItemRemoveById(request.user!, request.params.productId)
        .then(({ success }) => {
            if (!success)
                throw new Error("cartItemRemoveById error");
            return successResponse(response, undefined, 200, 'Cart item removed');
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));