import type {Request, Response} from "express";
import type {CastError} from "mongoose";
import {t} from "i18next";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import {rejectResponse, successResponse} from "../../utils/response";

/**
 * Remove ALL items in the user cart
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) => {
    // check done before entering the route
    req.user!.cartRemove()
        .then(({success, status}) => {
            if (!success)
                throw new Error("Unknown Error");
            return successResponse(res, undefined, status, t("ecommerce.product-cart-emptied"))
        })
        .catch((error: Error | CastError) => rejectResponse(res, ...databaseErrorInterpreter(error)))
}