import type {Request, Response} from "express";
import type {CastError} from "mongoose";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import {rejectResponse, successResponse} from "../../utils/response";

/**
 * Get cart of current user
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) => {
    // check done before entering the route
    req.user!.cartGet()
        .then((productList) => successResponse(res, productList))
        .catch((error: Error | CastError) => rejectResponse(res, ...databaseErrorInterpreter(error)))
}