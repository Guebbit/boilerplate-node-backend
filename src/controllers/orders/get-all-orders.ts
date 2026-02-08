import type { Request, Response, NextFunction } from "express";
import Orders from "../../models/orders";
import type { CastError } from "mongoose";
import {databaseErrorConverter} from "../../utils/error-helpers";

/**
 * Get all orders
 * Only admin can see other people orders
 *
 * Add total quantity, total items and total price
 *
 * @param request
 * @param response
 * @param next
 */
export const getAllOrders = async (request: Request, response: Response, next: NextFunction) =>
    Orders.getAll([
        {
            $match: request.session.user?.admin ? {} : {
                userId: request.session.user?._id
            }
        },
    ])
        .then((orderList) =>
            response.render('orders/list', {
                pageMetaTitle: 'All Orders',
                pageMetaLinks: [
                    "/css/order-list.css"
                ],
                orderList
            })
        )
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)))
