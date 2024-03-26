import type { Request, Response } from "express";

export default (req: Request, res: Response) =>
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