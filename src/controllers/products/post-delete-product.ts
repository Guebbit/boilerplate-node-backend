
import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import { databaseErrorConverter, ExtendedError } from "@utils/error-helpers";
import type { DeleteProductRequest } from "@api/api"
import ProductService from "@services/products";

/**
 * Delete a product
 *
 * @param request
 * @param response
 * @param next
 */
export const postDeleteProduct = (request: Request<unknown, unknown, DeleteProductRequest>, response: Response, next: NextFunction) =>
    ProductService.remove(request.body.id, !!request.body.hardDelete)
        .then(({ success, message }) => {
            if (success)
                request.flash('success', [ message ]);
            response.redirect('/products/')
        })
        .catch((error: Error) => {
            if (error.message == "404")
                return next(new ExtendedError("404", 404, false, [ t("ecommerce.product-not-found") ]));
            return next(databaseErrorConverter(error));
        })
