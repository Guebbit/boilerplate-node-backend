import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Orders from "../../models/orders";
import { databaseErrorConverter, ExtendedError } from "../../utils/error-helpers";
import type { DatabaseError, ValidationError } from "sequelize";


/**
 *
 */
export interface IGetTargetOrderParameters {
    orderId?: string,
}

/**
 * Get target order info
 *
 * @param request
 * @param response
 * @param next
 */
export const getTargetOrder = (request: Request & {
    params: IGetTargetOrderParameters
}, response: Response, next: NextFunction) => {
    // if it's not valid it could throw an error
    if (!request.params.orderId)
        return next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));

    // get target order (must be owner or admin)
    Orders.getAll(
        request.session.user?.admin ? "*" : request.session.user?.id,
        request.params.orderId
    )
        .then((orders) => {
            if (orders.length === 0) {
                next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));
                return;
            }
            response.render('orders/details', {
                pageMetaTitle: 'Order',
                pageMetaLinks: [
                    "/css/order-details.css",
                ],
                order: orders[0]
            })
        })
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))
};