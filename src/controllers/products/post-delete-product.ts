import type { CastError } from "mongoose";
import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import { databaseErrorConverter, ExtendedError } from "@utils/error-helpers";
import { successResponse } from "@utils/response";
import type { DeleteProductRequest } from "@api/api"
import ProductService from "@services/products";

/**
 * Delete a product (admin only) — ID provided in request body.
 * DELETE /products
 *
 * @param request
 * @param response
 * @param next
 */
export const postDeleteProduct = (request: Request<unknown, unknown, DeleteProductRequest>, response: Response, next: NextFunction) =>
    ProductService.remove(request.body.id, !!request.body.hardDelete)
        .then(({ success, message, errors = [] }) => {
            if (!success)
                return response.status(404).json({ success: false, error: errors[0] ?? 'not found', errors });
            return successResponse(response, undefined, 200, message);
        })
        .catch((error: CastError) => {
            if (error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.product-not-found") ]));
            return next(databaseErrorConverter(error));
        });

/**
 * Delete a product (admin only) — ID provided as path parameter.
 * DELETE /products/:id
 *
 * @param request
 * @param response
 * @param next
 */
export const deleteProductById = (request: Request<{ id: string }>, response: Response, next: NextFunction) =>
    postDeleteProduct(
        {
            ...request,
            body: { id: request.params.id, hardDelete: false },
        } as Request<unknown, unknown, DeleteProductRequest>,
        response,
        next,
    );
