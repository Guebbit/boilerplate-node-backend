import type { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import { t } from "i18next";
import Products from "../../models/products";
import { ExtendedError } from "../../utils/error-helpers";

/**
 * Get (single) product page
 * Only admin can see non-active products
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request, res: Response, next: NextFunction) =>
    (
        req.session.user?.admin ?
            // admin can search inactive or deleted products
        Products.findById(req.params.productId) :
            // NON admin can only search active and NOT (soft) deleted products
        Products.findOne({
            _id: req.params.productId,
            active: true,
            deletedAt: null
        })
    )
            .then(product => {
                if (!product)
                    return next(new ExtendedError("404", 404, t("ecommerce.product-not-found")));
                res.render('products/details', {
                    pageMetaTitle: product.title,
                    pageMetaLinks: [
                        "/css/product.css"
                    ],
                    product,
                });
            })
            .catch((error: CastError) => {
                if(error.message == "404" || error.kind === "ObjectId")
                    return next(new ExtendedError(t("ecommerce.product-not-found"), 404, ""));
                return next(new ExtendedError(error.kind, parseInt(error.message), "", false));
            })