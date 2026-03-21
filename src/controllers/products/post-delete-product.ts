import type { CastError } from "mongoose";
import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import { databaseErrorConverter, ExtendedError } from "../../utils/error-helpers";
import type { DeleteProductRequest } from "@api/api"

/**
 * Delete a product
 *
 * @param request
 * @param response
 * @param next
 */
export const postDeleteProduct = (request: Request<unknown, unknown, DeleteProductRequest>, response: Response, next: NextFunction) =>
    Products.removeById(request.body.id, !!request.body.hardDelete)
        .then(({ success, message }) => {
            if (success)
                request.flash('success', [ message ]);
            response.redirect('/products/')
        })
        .catch((error: CastError) => {
            if (error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError("404", 404, false, [ t("ecommerce.product-not-found") ]));
            return next(databaseErrorConverter(error));
        })
