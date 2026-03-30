import type {Request, Response} from "express";
import type {CastError} from "mongoose";
import {t} from "i18next";
import Users, {EUserRoles} from "../../models/users";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import {rejectResponse, successResponse} from "../../utils/response";
import {IGetTargetInvoiceParameters} from "../orders/get-target-invoice";

/**
 * Url parameters
 */
export interface IGetTargetProductParameters {
    id: string,
}

/**
 * Get (single) user page
 *
 * @param req
 * @param res
 */
export default async (req: Request & { params: IGetTargetInvoiceParameters }, res: Response) => {
    // if no admin, it must be the current user info that are requested
    if (!req.user?.roles.includes(EUserRoles.ADMIN) && req.user?.id !== req.params.id) {
        rejectResponse(res, 403, t("generic.error-forbidden"))
        return;
    }

    await Users.findById(req.params.id)
        .lean({virtuals: true})
        .then((user) => {
            if (!user) {
                rejectResponse(res, 404, t("users.user-not-found"))
                return
            }
            return successResponse(res, user)
        })
        .catch((error: CastError) => {
            if (error.message == "404" || error.kind === "ObjectId")
                return rejectResponse(res, 404, t("users.user-not-found"))
            return rejectResponse(res, ...databaseErrorInterpreter(error))
        })
}