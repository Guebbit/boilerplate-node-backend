import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Orders from "../../models/orders";
import {databaseErrorConverter, ExtendedError} from "../../utils/error-helpers";
import type {DatabaseError, ValidationError} from "sequelize";


/**
 * 
 */
export interface IGetTargetOrderParameters {
    orderId?: string,
}

/**
 * Get target order info
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request & { params: IGetTargetOrderParameters }, res: Response, next: NextFunction) => {
    // if it's not valid it could throw an error
    if(!req.params.orderId)
        return next(new ExtendedError("404", 404, true, [t("ecommerce.order-not-found")]));

    // get target order (must be owner or admin)
    Orders.getAll(
        req.session.user?.admin ? "*" : req.session.user?.id,
        req.params.orderId
    )
        .then((orders) => {
            if(orders.length  === 0){
                next(new ExtendedError("404", 404, true, [t("ecommerce.order-not-found")]));
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
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))
};