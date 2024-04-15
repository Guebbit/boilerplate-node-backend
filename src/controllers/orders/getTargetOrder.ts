import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Orders from "../../models/orders";
import { ExtendedError } from "../../utils/error-helpers";


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
 * @param next
 */
export default (req: Request & { params: IGetTargetOrderParameters }, res: Response, next: NextFunction) => {
    if(!req.user)
        return res.redirect('/account/login');
    Orders.getAll(
        !req.session.user?.admin ? req.session.user?.id : "*",
        req.params.orderId
    )
        .then((orders) => {
            if(orders.length < 1){
                next(new ExtendedError("404", 404, t("ecommerce.order-not-found")));
                return;
            }
            res.render('orders/details', {
                pageMetaTitle: 'Order',
                pageMetaLinks: [
                    "/css/order-details.css",
                ],
                order: orders[0]
            })
        })
        .catch(err =>
            next(new ExtendedError("500", 500, err, false)));
};