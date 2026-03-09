import type { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import { databaseErrorConverter } from "../../utils/error-helpers";

/**
 * Get cart of current user
 *
 * @param request
 * @param response
 * @param next
 */
export const pageCart = (request: Request, response: Response, next: NextFunction) =>
    // check done before entering the route
    request.user!.cartGet()
        .then((productList) =>
            response.render('cart', {
                pageMetaTitle: 'Your Cart',
                pageMetaLinks: [
                    "/css/cart.css",
                ],
                productList,
            })
        )
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)))