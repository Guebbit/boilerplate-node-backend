import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import type { CastError } from "mongoose";
import { ExtendedError } from "../../utils/error-helpers";

/**
 * Page POST data
 */
export interface IPostAddCartItemPostData {
    _id: string,
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
    Products.findOne({ _id: req.body._id, active: true, deletedAt: undefined })
        .then((product) => {
            // not found, something happened
            if(!product){
                req.flash('error', [t("ecommerce.product-not-found")]);
                return;
            }
            req.flash('success', [t("ecommerce.product-added-to-cart")]);
            // check done before entering the route
            return req.user!.cartItemSet(product, Number.parseInt(req.body.quantity));
        })
        .then(() => res.redirect('/cart'))
        .catch((error: CastError) =>
            next(new ExtendedError(error.kind, Number.parseInt(error.message), false)))