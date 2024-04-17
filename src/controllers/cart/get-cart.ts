import type { Request, Response, NextFunction } from "express";
import { ExtendedError } from "../../utils/error-helpers";

/**
 * Get all user cart
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request, res: Response, next: NextFunction) =>
    // check done before entering the route
    req.user!.cartGet()
        .then((cart) =>
            res.render('cart', {
                pageMetaTitle: 'Your Cart',
                pageMetaLinks: [
                    "/css/cart.css",
                ],
                productList: cart.CartItems || [],
            })
        )
        .catch((error: Error) =>
            next(new ExtendedError("500", 500, error.message, false)))