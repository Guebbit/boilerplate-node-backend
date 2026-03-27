import type { Request, Response, NextFunction } from "express";

import { databaseErrorConverter } from "@utils/error-helpers";
import UserService from "@services/users";

/**
 * Get cart of current user
 *
 * @param request
 * @param response
 * @param next
 */
export const pageCart = (request: Request, response: Response, next: NextFunction) =>
    // check done before entering the route
    UserService.cartGet(request.user!)
        .then((productList) =>
            response.render('misc/cart', {
                pageMetaTitle: 'Your Cart',
                pageMetaLinks: [
                    "/css/cart.css",
                ],
                productList,
            })
        )
        .catch((error: Error) => next(databaseErrorConverter(error)))