import type { Request, Response, NextFunction } from "express";
import Orders from "../../models/orders";
import type { CastError } from "mongoose";
import { ExtendedError } from "../../utils/error-helpers";

/**
 * Get all orders
 * Only admin can see other people orders
 *
 * Add total quantity, total items and total price
 *
 * @param req
 * @param res
 * @param next
 */
export default async (req: Request, res: Response, next: NextFunction) =>
    Orders.getAll([
        {
            $match: req.session.user?.admin ? {} : {
                userId: req.session.user?._id
            }
        },
    ])
        .then((orderList) =>
            res.render('orders/list', {
                pageMetaTitle: 'All Orders',
                pageMetaLinks: [
                    "/css/order-list.css"
                ],
                orderList
            })
        )
        .catch((error: CastError) =>
            next(new ExtendedError(error.kind, Number.parseInt(error.message), false)))
