import type { Request, Response, NextFunction } from "express";
import Orders from "../../models/orders";
import {databaseErrorConverter} from "../../utils/error-helpers";
import type {DatabaseError, ValidationError} from "sequelize";

/**
 * Get ALL orders info
 * Only of current user if NOT admin
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request, res: Response, next: NextFunction) =>
    Orders.getAll(
        req.session.user?.admin ? "*" : req.session.user?.id
    )
        .then((orders) =>
            res.render('orders/list', {
                pageMetaTitle: 'Your Orders',
                pageMetaLinks: [
                    "/css/order-list.css",
                ],
                orders
            })
        )
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))