import type {Request, Response} from "express";
import {CastError} from "mongoose";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import {rejectResponse, successResponse} from "../../utils/response";
import {IPostSetCartItemPostData} from "./post-set-cart-item";

/**
 * Page POST data
 */
export interface IPostDeleteCartItemPostData {
    id: string
}


/**
 * Delete target cart item
 *
 * @param req
 * @param res
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export default (req: Request<IPostDeleteCartItemPostData | {}, unknown, IPostDeleteCartItemPostData | {}>, res: Response) => {
    const {id} = req.method === "POST" ? req.body as IPostSetCartItemPostData : req.params as IPostSetCartItemPostData;
    // check done before entering the route
    req.user!.cartItemRemoveById(id)
        .then(({data, status, message}) => successResponse(res, data, status, message))
        .catch((error: Error | CastError) => rejectResponse(res, ...databaseErrorInterpreter(error)))
}