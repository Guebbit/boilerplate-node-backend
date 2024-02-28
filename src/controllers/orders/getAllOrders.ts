import type { Request, Response } from "express";
import Orders from "../../models/orders";

/**
 * Get all orders
 * Only admin can see other people orders
 *
 * Add total quantity, total items and total price
 *
 * @param req
 * @param res
 */
export default async (req: Request, res: Response) =>
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
        );
