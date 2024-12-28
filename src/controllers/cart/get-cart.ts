import type { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import {databaseErrorConverter} from "../../utils/error-helpers";

/**
 * Get cart of current user
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request, res: Response, next: NextFunction) =>
    // check done before entering the route
    req.user!.cartGet()
        .then((productList) =>
            res.render('cart', {
                pageMetaTitle: 'Your Cart',
                pageMetaLinks: [
                    "/css/cart.css",
                ],
                productList,
            })
        )
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)))