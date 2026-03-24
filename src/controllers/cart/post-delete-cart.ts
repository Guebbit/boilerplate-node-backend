import type { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import { databaseErrorConverter } from "@utils/error-helpers";
import { successResponse } from "@utils/response";
import UserService from "@services/users";

/**
 * Remove ALL items in the user cart
 * DELETE /cart
 *
 * @param request
 * @param response
 * @param next
 */
export const postDeleteCart = (request: Request, response: Response, next: NextFunction) =>
    // isAuth ensures request.user is set
    UserService.cartRemove(request.user!)
        .then(({ success }) => {
            if (!success)
                throw new Error("cartRemove error");
            return successResponse(response, undefined, 200, 'Cart cleared');
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));