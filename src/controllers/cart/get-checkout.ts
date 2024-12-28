import type { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import {databaseErrorConverter} from "../../utils/error-helpers";


/**
 * Get cart of user to display the order data (and proceed to checkout)
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request, res: Response, next: NextFunction) =>
    // check done before entering the route
    req.user!.cartGet()
        .then((productList) => {
            res.render('checkout', {
                pageMetaTitle: 'Checkout',
                pageMetaLinks: [
                    "/css/cart.css",
                ],
                productList,
            })
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)))