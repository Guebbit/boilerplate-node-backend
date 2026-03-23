import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
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
    const id = Number(request.params.orderId);
    if (!id || Number.isNaN(id))
        return next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));

    // Build search filters
    const filters = { id: request.params.orderId };
    // If user is NOT admin, scope to their own orders only
    const scope = !request.session.user?.admin && request.session.user?.id
        ? { userId: request.session.user.id }
        : {};

    OrderService.search(filters, scope)
        .then(({ items }) => {
            if (items.length === 0)
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));
            return response.render('orders/details', {
                pageMetaTitle: 'Order',
                pageMetaLinks: [
                    "/css/order-details.css",
                ],
                order: items[0]
            })
        })
        .catch((error: Error) => {
            if (error.message == "404")
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));
            return next(databaseErrorConverter(error));
        })
};
