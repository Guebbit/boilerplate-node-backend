import type { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import { t } from "i18next";
import { databaseErrorConverter, ExtendedError } from "@utils/error-helpers";
import { successResponse } from "@utils/response";
import type { ObjectId } from "mongodb";
import ProductService from "@services/products";

/**
 * Path parameters for single product endpoint
 */
export interface IGetTargetProductParameters {
    productId: string,
}

/**
 * Get a single product by ID
 * GET /products/:productId
 * Only admin can see inactive/soft-deleted products.
 *
 * @param request
 * @param response
 * @param next
 */
export const pageTargetProduct = (request: Request & {
    params: IGetTargetProductParameters
}, response: Response, next: NextFunction) =>
    ProductService.getById(request.params.productId, request.user?.admin)
        .then((product) => {
            if (!product)
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.product-not-found") ]));
            return successResponse(response, product as unknown as Record<string, unknown>);
        })
        .catch((error: CastError) => {
            if (error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.product-not-found") ]));
            return next(databaseErrorConverter(error));
        });