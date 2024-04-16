import type { Request, Response, NextFunction } from "express";
import Orders from "../../models/orders";
import { ExtendedError } from "../../utils/error-helpers";

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
        !req.session.user?.admin ? req.session.user?.id : "*"
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
        .catch(err =>
            next(new ExtendedError("500", 500, err, false)));