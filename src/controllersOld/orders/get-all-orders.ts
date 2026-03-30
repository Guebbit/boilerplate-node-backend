import {Request, Response} from "express";
import {CastError, PipelineStage, Types} from "mongoose";
import Orders from "../../models/orders";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import {rejectResponse, successResponse} from "../../utils/response";
import type {IPaginationParameters} from "../../types";
import {EUserRoles, type IUserDocument} from "../../models/users";

/**
 * Query parameters
 */
export interface IGetAllOrdersQueries {
    email?: string
    user?: string
    product?: string
}

/**
 *
 * @param query
 * @param user
 */
export const getFilters = (query: IGetAllOrdersQueries, user: IUserDocument) => {
    const filters: PipelineStage.Match = {
        $match: {}
    };

    if(query.email)
        filters.$match.email = query.email;
    if(query.user)
        filters.$match.userId = new Types.ObjectId(query.user);
    if(query.product)
        filters.$match["products.product._id"] = new Types.ObjectId(query.product);

    /**
     * User role filters
     * Only admin can see all orders.
     * Regular user can see only its own
     */
    if (!user.roles.includes(EUserRoles.ADMIN))
        filters.$match.userId = (user._id as Types.ObjectId).toString();

    return filters;
}

/**
 * Get all orders
 *
 * @param req
 * @param res
 */
export default async (req: Request<IPaginationParameters, unknown, IGetAllOrdersQueries>, res: Response) => {
    // Filters
    const whereCondition = getFilters(req.query, req.user!);

    // First retrieve total count (estimatedDocumentCount is faster but doesn't use filters)
    await Orders.getAll([whereCondition])
        // then show orders (and pagination)
        .then((orderList) =>
            successResponse(res, orderList)
        )
        .catch((error: Error | CastError) => rejectResponse(res, ...databaseErrorInterpreter(error)))
}