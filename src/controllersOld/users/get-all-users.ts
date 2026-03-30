import { Request, Response } from "express";
import type { CastError, FilterQuery } from "mongoose";
import Users, { type IUserDocument } from "../../models/users";
import { databaseErrorInterpreter } from "../../utils/helpers-errors";
import { rejectResponse, successResponse } from "../../utils/response";
import type { IPaginationParameters } from "../../types";
import { getFullUrl } from "../../utils/helpers-files";

/**
 * Query parameters
 */
export interface IGetAllUsersQueries {
    maxPrice?: string
    minPrice?: string
    text?: string
}

/**
 *
 * @param query
 */
export const getFilters = (query: IGetAllUsersQueries) => {
    let filters: FilterQuery<IUserDocument> = {};

    /**
     * Text filters
     * TODO ARRAY
     */
    if (query.text)
        filters = {
            ...filters,
            $or: [
                {
                    username: {
                        $regex: query.text,
                        $options: 'i'
                    }
                },
                {
                    email: {
                        $regex: query.text,
                        $options: 'i'
                    }
                },
            ],
        };

    return filters;
}

/**
 * Get all users
 *
 * @param req
 * @param res
 */
export default async (req: Request<IPaginationParameters, unknown, IGetAllUsersQueries>, res: Response) => {
    // Filters
    const whereCondition = getFilters(req.query);

    // First retrieve total count (estimatedDocumentCount is faster but doesn't use filters)
    // eslint-disable-next-line unicorn/no-array-callback-reference
    await Users.find(whereCondition)
        // eliminate mongoose metadata
        .lean({ virtuals: true })
        // then show users (and pagination)
        .then((userList) =>
            successResponse(res, userList.map(user => ({
                imageUrl: getFullUrl(req, user.imageUrl),
            })))
        )
        .catch((error: Error | CastError) => rejectResponse(res, ...databaseErrorInterpreter(error)))
}