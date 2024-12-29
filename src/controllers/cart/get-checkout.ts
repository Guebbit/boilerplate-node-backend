import type { Request, Response, NextFunction } from "express";
import {databaseErrorConverter} from "../../utils/error-helpers";
import type {DatabaseError, ValidationError} from "sequelize";

/**
 * Same as getCart, but with different template
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request, res: Response, next: NextFunction) =>
    // check done before entering the route
    req.user!.cartGet()
        .then((cart) => {
            res.render('checkout', {
                pageMetaTitle: 'Checkout',
                pageMetaLinks: [
                    "/css/cart.css",
                ],
                // @ts-expect-error difficulties with sequelize inferred types
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                productList: cart.CartItems ?? [],
            })
        })
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))