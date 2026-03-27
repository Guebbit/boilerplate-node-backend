import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import type { IOrder } from "@models/orders";
import OrderService from "@services/orders";
import { databaseErrorConverter, ExtendedError } from "@utils/error-helpers";

/**
 * Url parameters
 */
export interface IGetTargetOrderParameters {
    orderId: string,
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
    const orderId = Number(request.params.orderId);
    if (!orderId || Number.isNaN(orderId))
        return next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));

    const where: Partial<IOrder> = { id: orderId };
    if (!request.session.user?.admin && request.session.user?.id)
        where.userId = request.session.user.id;

    OrderService.getAll(where)
        .then((orders) => {
            if (orders.length === 0)
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));
            return response.render('orders/details', {
                pageMetaTitle: 'Order',
                pageMetaLinks: [
                    "/css/order-details.css",
                ],
                order: orders[0]
            })
        })
        .catch((error: Error) => next(databaseErrorConverter(error)));
};
