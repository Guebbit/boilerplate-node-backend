import type {CastError} from "mongoose";
import type {Request, Response} from "express";
import {t} from "i18next";
import Users from "../../models/users";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import {rejectResponse, successResponse} from "../../utils/response";

/**
 *
 */
export interface IGetDeleteProductParameters {
    id?: string
}

/**
 *
 */
export interface IGetDeleteProductQuery {
    hardDelete?: string
}

/**
 * Delete a product
 *
 * @param req
 * @param res
 */
export default async (req: Request<IGetDeleteProductParameters, unknown, IGetDeleteProductQuery>, res: Response) => {
    if(!req.params.id){
        rejectResponse(res, 404, t("users.user-not-found"))
        return;
    }
    await Users.userRemoveById(req.params.id, Object.hasOwnProperty.call(req.query, "hardDelete"))
        .then(({success, status, message}) => {
            if (!success)
                return rejectResponse(res, status, message)
            return successResponse(res, message)
        })
        .catch((error: CastError) => {
            if (error.message == "404" || error.kind === "ObjectId")
                return rejectResponse(res, 404, t("users.user-not-found"))
            return rejectResponse(res, ...databaseErrorInterpreter(error))
        })
}
