import type { Request, Response } from "express";
import Products from "../../models/products";

/**
 *
 */
export interface postAddCartItemBodyParameters {
    id: string,
    quantity: string,
}

/**
 * Add a product (with its quantity) to cart
 * Create a CartItem row
 *
 * @param req
 * @param res
 */
export default (req: Request<{}, {}, postAddCartItemBodyParameters>, res: Response) => {
    if (!req.user)
        return res.status(500).redirect('/errors/500-unknown');

    Products.findByPk(req.body.id)
        .then((product) => {
            if(!product)
                return;
            return req.user!.addToCart(product, parseInt(req.body.quantity));
        })
        .then(() =>
            req.user!.Cart.getProducts({
                joinTableAttributes: [
                    'quantity'
                ]
            })
        )
        .then(() => res.redirect('/cart'));
};