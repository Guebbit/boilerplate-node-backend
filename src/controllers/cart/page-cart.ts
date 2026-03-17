import type { Request, Response, NextFunction } from "express";
import { databaseErrorConverter } from "../../utils/error-helpers";
import type { DatabaseError, ValidationError } from "sequelize";

/**
 * Get all user cart
 *
 * @param request
 * @param response
 * @param next
 */
export const pageCart = (request: Request, response: Response, next: NextFunction) =>
    // check done before entering the route
    request.user!.cartGet()
        .then((cart) =>
            response.render('cart', {
                pageMetaTitle: 'Your Cart',
                pageMetaLinks: [
                    "/css/cart.css",
                ],
                // @ts-expect-error difficulties with sequelize inferred types

                productList: cart.CartItems ?? [],
            })
        )
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))