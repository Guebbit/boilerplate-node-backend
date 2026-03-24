import { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import { databaseErrorConverter } from "@utils/error-helpers";
import { successResponse } from "@utils/response";
import type { SearchProductsRequest } from "@api/api";
import ProductService from "@services/products";

/**
 * Query parameters for product listing/search
 */
export type IGetAllProductsQuery = Partial<Record<keyof SearchProductsRequest, string>>;

/**
 * List products (paginated)
 * GET /products
 *
 * @param request
 * @param response
 * @param next
 */
export const pageAllProducts = async (
    request: Request<unknown, unknown, unknown, IGetAllProductsQuery>,  // fourth generic = query
    response: Response,
    next: NextFunction
) =>
    ProductService.search(
        {
            ...request.query,
            minPrice: request.query?.minPrice ? Number.parseInt(request.query.minPrice) : undefined,
            maxPrice: request.query?.maxPrice ? Number.parseInt(request.query.maxPrice) : undefined,
            page: Number.parseInt(request.query.page ?? "1"),
            pageSize: Number.parseInt(request.query.pageSize ?? process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE ?? "10"),
        },
        request.user?.admin
    )
        .then(({ items, meta }) =>
            successResponse(response, { items, meta })
        )
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));