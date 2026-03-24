import type { Request, Response, NextFunction } from "express";
import {
    Types,
    type CastError,
    type PipelineStage
} from "mongoose";
import { t } from "i18next";
import OrderService from "@services/orders";
import { databaseErrorConverter, ExtendedError } from "@utils/error-helpers";
import { successResponse } from "@utils/response";

/**
 * Path parameters for single order endpoint
 */
export interface IGetTargetOrderParameters {
    orderId: string,
}

/**
 * Get a single order by ID
 * GET /orders/:orderId
 * Admin can see any order; regular users only see their own.
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
    if (!request.user?.admin)
        match.$match.userId = request.user?._id;
    // single out the order
    match.$match._id = new Types.ObjectId(request.params.orderId);

    /**
     * Get info from database
     */
    OrderService.getAll([ match ])
        .then((orders) => {
            if (orders.length === 0)
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));
            return successResponse(response, orders[0] as unknown as Record<string, unknown>);
        })
        .catch((error: CastError) => {
            if (error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));
            return next(databaseErrorConverter(error));
        });
};