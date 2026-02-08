import type { Request, Response, NextFunction } from "express";
import Orders from "../../models/orders";
import {databaseErrorConverter} from "../../utils/error-helpers";
import type {DatabaseError, ValidationError} from "sequelize";

/**
 * Get ALL orders info
 * Only of current user if NOT admin
 *
 * @param request
 * @param response
 * @param next
 */
export const getAllOrders = (request: Request, response: Response, next: NextFunction) =>
    Orders.getAll(
        request.session.user?.admin ? "*" : request.session.user?.id
    )
        .then((orders) =>
            response.render('orders/list', {
                pageMetaTitle: 'Your Orders',
                pageMetaLinks: [
                    "/css/order-list.css",
                ],
                orders
            })
        )
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))