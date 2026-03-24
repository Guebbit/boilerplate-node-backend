import type { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import { databaseErrorConverter } from "@utils/error-helpers";
import { successResponse } from "@utils/response";
import type { SearchProductsRequest } from "@api/api";
import ProductService from "@services/products";

/**
 * Search products (POST body filters)
 * POST /products/search
 *
 * @param request
 * @param response
 * @param next
 */
export const postSearchProducts = async (
    request: Request<unknown, unknown, SearchProductsRequest>,
    response: Response,
    next: NextFunction
) =>
    ProductService.search(
        {
            ...request.body,
            page: Number(request.body.page ?? 1),
            pageSize: Number(request.body.pageSize ?? process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE ?? 10),
        },
        request.user?.admin
    )
        .then(({ items, meta }) =>
            successResponse(response, { items, meta })
        )
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));
