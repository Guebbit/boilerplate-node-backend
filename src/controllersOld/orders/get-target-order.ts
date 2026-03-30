import type {Request, Response} from "express";
import {
    Types,
    type CastError,
    type PipelineStage
} from "mongoose";
import {t} from "i18next";
import Orders from "../../models/orders";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import {rejectResponse, successResponse} from "../../utils/response";
import {EUserRoles} from "../../models/users";

/**
 * Url parameters
 */
export interface IGetTargetOrderParameters {
    id?: string,
}

/**
 * Get target order info
 *
 * @param req
 * @param res
 */
export default async (req: Request & { params: IGetTargetOrderParameters }, res: Response) => {
    // if it's not valid it could throw an error
    if (!req.params.id || !Types.ObjectId.isValid(req.params.id)){
        rejectResponse(res, 404, t("ecommerce.order-not-found"))
        return
    }

    /**
     * Where build
     */
    const match: PipelineStage.Match = {
        $match: {}
    };
    // If user is NOT admin, it's limited to his own orders
    if (!req.user?.roles.includes(EUserRoles.ADMIN))
        match.$match.userId = req.user?._id;
    // single out the order
    match.$match._id = new Types.ObjectId(req.params.id);

    /**
     * Get info from database
     */
    await Orders.getAll([match])
        .then((orders) => {
            if (orders.length === 0)
                return rejectResponse(res, 404, t("ecommerce.order-not-found"))
            return successResponse(res, orders[0]);
        })
        .catch((error: CastError) => {
            if (error.message == "404" || error.kind === "ObjectId")
                return rejectResponse(res, 404, t("ecommerce.order-not-found"))
            return rejectResponse(res, ...databaseErrorInterpreter(error))
        })
};