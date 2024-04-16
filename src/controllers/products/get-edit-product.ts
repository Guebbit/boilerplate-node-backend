import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import { ExtendedError } from "../../utils/error-helpers";
import type { CastError } from "mongoose";


/**
 * Url parameters
 */
export interface IGetEditProductParameters {
    productId: string,
}

/**
 * Get product insertion page
 * If productId is provided: it's an editing page
 *
 * @param req
 * @param res
 */
export default (req: Request & { params: IGetEditProductParameters }, res: Response, next: NextFunction) => {
    Products.findById(req.params.productId)
        .then(product => {
            const [
                title,
                price,
                description,
                active,
            ] = req.flash('filled');
            res.render('products/edit', {
                pageMetaTitle: product ? "Edit product" : "Add product",
                pageMetaLinks: [
                    "/css/forms.css"
                ],
                // old object (if any)
                product: product || {
                    // filled inputs (if any)
                    title,
                    price,
                    description,
                    active,
                },
            });
        })
        .catch((error: CastError) => {
            if(error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError(t("ecommerce.product-not-found"), 404, ""));
            return next(new ExtendedError(error.kind, parseInt(error.message), "", false));
        })
};