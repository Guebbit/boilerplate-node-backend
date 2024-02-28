import type { Request, Response } from "express";
import Products from "../../models/products";

export default (req: Request, res: Response) =>
    // check done before entering the route
    req.user!.getCart()
        .then((productList) => {
            res.render('cart', {
                pageMetaTitle: 'Your Cart',
                pageMetaLinks: [
                    "/css/cart.css",
                ],
                productList,
            })
        })