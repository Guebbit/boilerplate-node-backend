import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import { ExtendedError } from "../../utils/error-helpers";

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
 * @param next
 */
export default (req: Request<unknown, unknown, IPostAddCartItemPostData>, res: Response, next: NextFunction) =>
    Products.findByPk(req.body.id)
        .then((product) => {
            // not found, something happened
            if (!product)
                return next(new ExtendedError("404", 404, t("ecommerce.product-not-found")));
            req.flash('success', [t("ecommerce.product-added-to-cart")]);
            // check done before entering the route
            return req.user!.cartItemSet(product, parseInt(req.body.quantity));
        })
        .then(() => res.redirect('/cart'));