import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import { databaseErrorConverter, ExtendedError } from "../../utils/error-helpers";
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
 * @param request
 * @param response
 * @param next
 */
export const pageEditProduct = (request: Request & {
    params: IGetEditProductParameters
}, response: Response, next: NextFunction) => {
    Products.findById(request.params.productId)
        .then(product => {
            const [
                title,
                price,
                description,
                active,
            ] = request.flash('filled');
            response.render('products/edit', {
                pageMetaTitle: product ? "Edit product" : "Add product",
                pageMetaLinks: [
                    "/css/forms.css"
                ],
                // old object (if any)
                product: product ?? {
                    // filled inputs (if any)
                    title,
                    price,
                    description,
                    active,
                },
            });
        })
        .catch((error: CastError) => {
            if (error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.product-not-found") ]));
            return next(databaseErrorConverter(error));
        })
};