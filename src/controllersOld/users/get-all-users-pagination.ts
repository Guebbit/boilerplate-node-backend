import { Request, Response } from "express";
import type { CastError } from "mongoose";
import Users from "../../models/users";
import { databaseErrorInterpreter } from "../../utils/helpers-errors";
import { getPagination } from "../../utils/helpers-pagination";
import { rejectResponse, successResponse } from "../../utils/response";
import type { IPaginationParameters } from "../../types";
import { getFilters, type IGetAllUsersQueries } from "./get-all-users";
import { getFullUrl } from "../../utils/helpers-files";


/**
 * Get all users
 *
 * @param req
 * @param res
 */
export default async (req: Request<IPaginationParameters, unknown, IGetAllUsersQueries>, res: Response) => {
    // Pagination
    const pagination = getPagination(req.params);
    // Filters
    const whereCondition = getFilters(req.query);
    // Query total records
    let paginationTotalItems = 0;

    // First retrieve total count (estimatedDocumentCount is faster but doesn't use filters)
    await Users.countDocuments(whereCondition)
        .then(num => {
            paginationTotalItems = num;
            // true search
            // eslint-disable-next-line unicorn/no-array-callback-reference
            return Users.find(whereCondition)
                // eliminate mongoose metadata
                .lean({ virtuals: true })
                // selected page items START (skip the first results)
                .skip((pagination.current - 1) * pagination.size)
                // selected page items END (cut all exceeding results)
                .limit(pagination.size)
        })
        // then show users (and pagination)
        .then((userList) =>
            successResponse(res, {
                page: pagination.current,
                total: paginationTotalItems,
                totalPages: Math.ceil(paginationTotalItems / pagination.size),
                items: userList.map(user => ({
                    imageUrl: getFullUrl(req, user.imageUrl),
                }))
            })
        )
        .catch((error: Error | CastError) => rejectResponse(res, ...databaseErrorInterpreter(error)))
}