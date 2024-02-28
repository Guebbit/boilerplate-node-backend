import type { Request, Response } from "express";
import Products from "../../models/products";
import {t} from "i18next";

/**
 * Page POST data
 */
export interface postAddCartItemPostData {
    _id: string,
    quantity: string,
}

/**
 * Add a product (with its quantity) to cart, check availability, etc
 * Create a CartItem row.
 *
 * @param req
 * @param res
 */
export default (req: Request<{}, {}, postAddCartItemPostData>, res: Response) =>
    Products.findOne({ _id: req.body._id, active: true, deletedAt: undefined })
        .then((product) => {
            // not found, something happened
            if(!product){
                req.flash('error', [t("ecommerce.product-not-found")]);
                return;
            }
            req.flash('success', [t("ecommerce.product-added-to-cart")]);
            // check done before entering the route
            return req.user!.cartAdd(product, parseInt(req.body.quantity));
        })
        .then(() => res.redirect('/cart'));