import type { Request, Response, NextFunction } from "express";
import { databaseErrorConverter } from "@utils/error-helpers";
import UserService from "@services/users";

/**
 * Remove ALL items in the user cart
 *
 * @param request
 * @param response
 * @param next
 */
export const postDeleteCart = (request: Request, response: Response, next: NextFunction) =>
    // check done before entering the route
    UserService.cartRemove(request.user!)
        .then(({ success }) => {
            if (!success)
                throw new Error("cartRemove error");
            return response.redirect('/cart');
        })
        .catch((error: Error) => next(databaseErrorConverter(error)));