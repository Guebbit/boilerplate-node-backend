import type { Request, Response, NextFunction } from "express";
import {
    Types,
    type CastError,
    type PipelineStage
} from "mongoose";
import { t } from "i18next";
import Orders from "../../models/orders";
import { databaseErrorConverter, ExtendedError } from "../../utils/error-helpers";

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
    // if it's not valid it could throw an error
    if (!Types.ObjectId.isValid(request.params.orderId))
        return next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));

    /**
     * Where build
     */
        // empty match
    const match: PipelineStage.Match = {
            $match: {}
        };
    // If user is NOT admin, it's limited to his own orders
    if (!request.session.user?.admin)
        match.$match.userId = request.session.user?._id;
    // single out the order
    match.$match._id = new Types.ObjectId(request.params.orderId);

    /**
     * Get info from database
     */
    Orders.getAll([ match ])
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
        .catch((error: CastError) => {
            if (error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));
            return next(databaseErrorConverter(error));
        })
};