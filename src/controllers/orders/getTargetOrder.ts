import type { Request, Response, NextFunction } from "express";
import {
    Types,
    type CastError,
    type PipelineStage
} from "mongoose";
import { t } from "i18next";
import Orders from "../../models/orders";
import { ExtendedError } from "../../utils/error-helpers";

/**
 * Url parameters
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
    // if it's not valid it could throw an error
    if(!Types.ObjectId.isValid(req.params.orderId))
        return next(new ExtendedError(t("ecommerce.order-not-found"), 404, ""));

    /**
     * Where build
     */
    // empty match
    const match: PipelineStage.Match = {
        $match: {}
    };
    // If user is NOT admin, it's limited to his own orders
    if(!req.session.user?.admin)
        match.$match.userId = req.session.user?._id;
    // single out the order
    match.$match._id = new Types.ObjectId(req.params.orderId);

    /**
     * Get orders
     */
    Orders.getAll([match])
        .then((orders) => {
            if (orders.length < 1)
                return next(new ExtendedError("404", 404, t("ecommerce.order-not-found")));
            return res.render('orders/details', {
                pageMetaTitle: 'Order',
                pageMetaLinks: [
                    "/css/order-details.css",
                ],
                order: orders[0]
            })
        })
        .catch((error: CastError) => {
            if(error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError(t("ecommerce.order-not-found"), 404, ""));
            return next(new ExtendedError(error.kind, parseInt(error.message), "", false));
        })
};