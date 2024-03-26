import type { Request, Response } from "express";
import Orders from "../../models/orders";

/**
 * 
 */
export interface IGetTargetOrderParameters {
    orderId: string,
}

/**
 * Get target order info
 *
 * @param req
 * @param res
 */
export default (req: Request & { params: IGetTargetOrderParameters }, res: Response) => {
    if(!req.user)
        return res.redirect('/account/login');
    Orders.getAll(
        !req.session.user?.admin ? req.session.user?.id : "*",
        req.params.orderId
    )
        .then((orders) => {
            if(orders.length < 1)
                throw 404;
            res.render('orders/details', {
                pageMetaTitle: 'Order',
                pageMetaLinks: [
                    "/css/order-details.css",
                ],
                order: orders[0]
            })
        })
        .catch(() => {
            // TODO global error catchers
            return res.redirect('/error/404');
        });
};