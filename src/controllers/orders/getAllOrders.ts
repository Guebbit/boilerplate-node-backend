import type { Request, Response } from "express";
import Orders from "../../models/orders";

/**
 * Get ALL orders info
 * Only of current user if NOT admin
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) =>
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
        );