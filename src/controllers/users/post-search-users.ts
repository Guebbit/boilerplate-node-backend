import type { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import { databaseErrorConverter } from "@utils/error-helpers";
import { successResponse } from "@utils/response";
import type { SearchUsersRequest } from "@api/api";
import UserService from "@services/users";

/**
 * Search users (POST body filters)
 * POST /users/search (admin only)
 *
 * @param request
 * @param response
 * @param next
 */
export const postSearchUsers = async (
    request: Request<unknown, unknown, SearchUsersRequest>,
    response: Response,
    next: NextFunction
) =>
    UserService.search(
        {
            ...request.body,
            page: Number(request.body.page ?? 1),
            pageSize: Number(request.body.pageSize ?? process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE ?? 10),
        },
    )
        .then(({ items, meta }) =>
            successResponse(response, { items, meta })
        )
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));
