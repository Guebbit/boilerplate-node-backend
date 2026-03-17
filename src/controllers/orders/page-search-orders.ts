import type { Request, Response, NextFunction } from "express";
import Orders from "../../models/orders";
import { databaseErrorConverter } from "../../utils/error-helpers";
import type { DatabaseError, ValidationError } from "sequelize";

/**
 * Search orders (DTO-friendly) — POST /orders/search
 * Only of current user if NOT admin
 *
 * Mirrors OpenAPI: SearchOrdersRequest (page, pageSize, id, userId, productId, email)
 *
 * @param request
 * @param response
 * @param next
 */
export const pageSearchOrders = (request: Request, response: Response, next: NextFunction) => {
    const body = (request.body ?? {}) as {
        page?: number;
        pageSize?: number;
        id?: string;
        userId?: string;
        productId?: string;
        email?: string;
    };

    // If not admin, force search scope to current user
    const scopedBody = request.session.user?.admin
        ? body
        : {
            ...body,
            userId: request.session.user?.id,
        };

    return Orders.search(scopedBody)
        .then((ordersPage) =>
            response.render("orders/list", {
                pageMetaTitle: "Your Orders",
                pageMetaLinks: ["/css/order-list.css"],
                // keep naming flexible; adapt to what your view expects
                orders: ordersPage?.items ?? ordersPage,
                meta: ordersPage?.meta,
                search: scopedBody,
            })
        )
        .catch((error: Error | ValidationError | DatabaseError) =>
            next(databaseErrorConverter(error)),
        );
};