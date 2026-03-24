import { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import { databaseErrorConverter } from "@utils/error-helpers";
import { successResponse } from "@utils/response";
import type { SearchUsersRequest } from "@api/api";
import UserService from "@services/users";

/**
 * Query parameters for user listing/search
 */
export type IGetAllUsersQuery = Partial<Record<keyof SearchUsersRequest, string>>;

/**
 * List users (paginated)
 * GET /users (admin only)
 *
 * @param request
 * @param response
 * @param next
 */
export const pageAllUsers = async (
    request: Request<unknown, unknown, unknown, IGetAllUsersQuery>,  // fourth generic = query
    response: Response,
    next: NextFunction
) =>
    UserService.search(
        {
            ...request.query,
            page: Number.parseInt(request.query.page ?? "1"),
            pageSize: Number.parseInt(request.query.pageSize ?? process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE ?? "10"),
            // convert string "true"/"false" to boolean for the active filter
            active: request.query.active === undefined
                ? undefined
                : request.query.active === 'true',
        },
    )
        .then(({ items, meta }) =>
            successResponse(response, { items, meta })
        )
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));
