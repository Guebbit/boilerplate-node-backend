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
 * @param req
 * @param res
 * @param next
 */
export default (req: Request<unknown, unknown, IPostSetCartItemPostData>, res: Response, next: NextFunction) =>
    Products.findByPk(req.body.id)
        .then(async (product) => {
            // not found, something happened
            if (!product)
                return next(new ExtendedError("404", 404, false, [t("ecommerce.product-not-found")]));
            req.flash('success', [t("ecommerce.product-added-to-cart")]);
            // check done before entering the route
            await req.user!.cartItemSet(product, Number.parseInt(req.body.quantity));
            res.redirect('/cart')
        })
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))