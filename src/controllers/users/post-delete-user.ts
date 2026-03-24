import type { CastError } from "mongoose";
import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import { databaseErrorConverter, ExtendedError } from "@utils/error-helpers";
import { successResponse } from "@utils/response";
import type { DeleteUserRequest } from "@api/api";
import UserService from "@services/users";

/**
 * Delete a user (admin only) — ID provided in request body.
 * DELETE /users
 *
 * @param request
 * @param response
 * @param next
 */
export const postDeleteUser = (request: Request<unknown, unknown, DeleteUserRequest>, response: Response, next: NextFunction) =>
    UserService.remove(request.body.id, !!request.body.hardDelete)
        .then(({ success, message, errors = [] }) => {
            if (!success)
                return response.status(404).json({ success: false, error: errors[0] ?? 'not found', errors });
            return successResponse(response, undefined, 200, message);
        })
        .catch((error: CastError) => {
            if (error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError("404", 404, true, [ t("admin.user-not-found") ]));
            return next(databaseErrorConverter(error));
        });

/**
 * Delete a user (admin only) — ID provided as path parameter.
 * DELETE /users/:userId
 *
 * @param request
 * @param response
 * @param next
 */
export const deleteUserById = (request: Request<{ userId: string }>, response: Response, next: NextFunction) =>
    postDeleteUser(
        {
            ...request,
            body: { id: request.params.userId, hardDelete: false },
        } as Request<unknown, unknown, DeleteUserRequest>,
        response,
        next,
    );
