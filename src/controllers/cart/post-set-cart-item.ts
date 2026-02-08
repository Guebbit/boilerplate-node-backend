import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import {databaseErrorConverter, ExtendedError} from "../../utils/error-helpers";
import type {DatabaseError, ValidationError} from "sequelize";

/**
 * Page POST data
 */
export interface IPostSetCartItemPostData {
    id: string,
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
    Products.findByPk(request.body.id)
        .then(async (product) => {
            // not found, something happened
            if (!product)
                return next(new ExtendedError("404", 404, false, [t("ecommerce.product-not-found")]));
            request.flash('success', [t("ecommerce.product-added-to-cart")]);
            // check done before entering the route
            await request.user!.cartItemSet(product, Number.parseInt(request.body.quantity));
            response.redirect('/cart')
        })
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))