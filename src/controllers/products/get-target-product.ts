import type { NextFunction, Request, Response } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import { ExtendedError } from "../../utils/error-helpers";

/**
 * Url parameters
 */
export interface IGetTargetProductParameters {
    productId: string,
}

/**
 * Get single product details
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request & { params: IGetTargetProductParameters }, res: Response, next: NextFunction) =>
    (req.session.user?.admin ? Products.scope("admin") : Products)
        .findByPk(req.params.productId)
        .then(product => {
            if (!product)
                return next(new ExtendedError("404", 404, t("ecommerce.product-not-found")));
            res.render("products/details", {
                pageMetaTitle: product.dataValues.title,
                pageMetaLinks: [
                    "/css/product.css"
                ],
                product: product.dataValues,
            });
        })
        .catch((error: Error) =>
            next(new ExtendedError("500", 500, error.message, false)))