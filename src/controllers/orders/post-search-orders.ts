import type { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import { databaseErrorConverter } from "@utils/error-helpers";
import { successResponse } from "@utils/response";
import type { SearchOrdersRequest } from "@api/api";
import OrderService from "@services/orders";

/**
 * Search orders (POST body filters)
 * POST /orders/search
 * Admin sees all; regular users see only their own.
 *
 * @param request
 * @param response
 * @param next
 */
export const postSearchOrders = async (
    request: Request<unknown, unknown, SearchOrdersRequest>,
    response: Response,
    next: NextFunction,
) =>
    OrderService.search(
        {
            ...request.body,
            page: Number(request.body.page ?? 1),
            pageSize: Number(request.body.pageSize ?? process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE ?? 10),
        },
        // Only admin can see all orders; regular users see only their own
        request.user?.admin
            ? {}
            : { userId: request.user?._id },
    )
        .then(({ items, meta }) =>
            successResponse(response, { items, meta })
        )
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));
