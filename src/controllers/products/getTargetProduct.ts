import type { NextFunction, Request, Response } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import type { IStatusError } from "../../types";

/**
 * Get single product details
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request, res: Response, next: NextFunction) =>
    // [admin scope] rule
    (req.session.user?.admin ? Products.unscoped() : Products)
        .findByPk(req.params.productId)
        .then(product => {
            if (!product){
                const error: IStatusError = new Error(t("ecommerce.product-not-found"));
                error.status = 404;
                return next(error);
            }
            res.render("products/details", {
                pageMetaTitle: product.dataValues.title,
                pageMetaLinks: [
                    "/css/product.css"
                ],
                product: product.dataValues,
            });
        })
        .catch((err) => {
            const error: IStatusError = new Error(err);
            error.status = 500;
            return next(error);
        });