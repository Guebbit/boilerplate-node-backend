import type { Request, Response } from "express";

/**
 * Get all user cart
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) =>
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