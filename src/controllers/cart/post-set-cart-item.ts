import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import type { CastError } from "mongoose";
import { databaseErrorConverter } from "../../utils/error-helpers";

/**
 * Page POST data
 */
export interface IPostSetCartItemPostData {
    _id: string,
    quantity: string,
}

/**
 * Add a product (with its quantity) to cart, check availability, etc
 * Create a CartItem row.
 *
 * @param request
 * @param response
 * @param next
 */
export const postSetCartItem = (request: Request<unknown, unknown, IPostSetCartItemPostData>, response: Response, next: NextFunction) =>
    Products.findOne({ _id: request.body._id, active: true, deletedAt: undefined })
        .then((product) => {
            // not found, something happened
            if (!product) {
                request.flash('error', [ t("ecommerce.product-not-found") ]);
                return;
            }
            request.flash('success', [ t("ecommerce.product-added-to-cart") ]);
            // check done before entering the route
            return request.user!.cartItemSet(product, Number.parseInt(request.body.quantity));
        })
        .then(() => response.redirect('/cart'))
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)))