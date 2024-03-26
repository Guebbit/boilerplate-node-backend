import type { Request, Response } from "express";
import Products from "../../models/products";
import { t } from "i18next";

/**
 * Page POST data
 */
export interface IPostAddCartItemPostData {
    id: string,
    quantity: string,
}

/**
 * Add a product (with its quantity) to cart, check availability, etc
 * Create a CartItem row.
 *
 * @param req
 * @param res
 */
export default (req: Request<unknown, unknown, IPostAddCartItemPostData>, res: Response) =>
    Products.findByPk(req.body.id)
        .then((product) => {
            // not found, something happened
            if(!product){
                req.flash('error', [t("ecommerce.product-not-found")]);
                return;
            }
            req.flash('success', [t("ecommerce.product-added-to-cart")]);
            // check done before entering the route
            return req.user!.cartItemSet(product, parseInt(req.body.quantity));
        })
        .then(() => res.redirect('/cart'));