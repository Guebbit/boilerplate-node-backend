import type { Request, Response } from "express";

/**
 * Same as getCart, but with different template
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) =>
    // check done before entering the route
    req.user!.cartGet()
        .then((cart) => {
            res.render('checkout', {
                pageMetaTitle: 'Checkout',
                pageMetaLinks: [
                    "/css/cart.css",
                ],
                productList: cart.CartItems || [],
            })
        })