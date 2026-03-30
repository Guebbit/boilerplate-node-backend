import {Request, Response} from "express";
import {CastError} from "mongoose";
import Orders from "../../models/orders";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import {getPagination} from "../../utils/helpers-pagination";
import {rejectResponse, successResponse} from "../../utils/response";
import type {IPaginationParameters} from "../../types";
import {getFilters, type IGetAllOrdersQueries} from "./get-all-orders";

/**
 * Get all orders
 *
 * @param req
 * @param res
 */
export default async (req: Request<IPaginationParameters, unknown, IGetAllOrdersQueries>, res: Response) => {
    // Pagination
    const pagination = getPagination(req.params);
    // Filters
    const whereCondition = getFilters(req.query, req.user!);
    // Query total records
    let paginationTotalItems = 0;

    // First retrieve total count (estimatedDocumentCount is faster but doesn't use filters)
    await Orders.countDocuments(whereCondition.$match)
        .then(num => {
            paginationTotalItems = num;
            // true search
            return Orders.getAll([whereCondition], pagination.current, pagination.size)
        })
        // then show orders (and pagination)
        .then((orderList) =>
            successResponse(res, {
                page: pagination.current,
                total: paginationTotalItems,
                totalPages: Math.ceil(paginationTotalItems / pagination.size),
                items: orderList
            })
        )
        .catch((error: Error | CastError) => rejectResponse(res, ...databaseErrorInterpreter(error)))
}