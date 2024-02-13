import type {Request, Response} from "express";
import Products from "../../models/products";

export default (req: Request, res: Response) => {
    if (!req.user)
        return res.redirect('/account/login');

    req.user.Cart.getProducts({
        joinTableAttributes: [
            'quantity'
        ]
    })
        .then((productList) =>
            res.render('cart', {
                pageMetaTitle: 'Your Cart',
                pageMetaLinks: [
                    "/css/cart.css",
                ],
                productList,
            })
        );

    /**
     * EXAMPLE: first I add to cart, THEN I retrieve data (has been updated)
     */
    // Products.findByPk(1)
    //     .then((product) => {
    //         if (!product)
    //             return;
    //         return req.user!.addToCart(product, 4);
    //     })
    //     .then(() =>
    //         req.user!.Cart.getProducts({
    //             joinTableAttributes: [
    //                 'quantity'
    //             ]
    //         })
    //             .then((productList) =>
    //                 res.render('cart', {
    //                     pageMetaTitle: 'Your Cart',
    //                     pageMetaLinks: [
    //                         "/css/cart.css",
    //                     ],
    //                     productList,
    //                 })
    //             )
    //     )
}