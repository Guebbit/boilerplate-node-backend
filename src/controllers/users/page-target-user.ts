import type { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import { t } from "i18next";
import { databaseErrorConverter, ExtendedError } from "@utils/error-helpers";
import { successResponse } from "@utils/response";
import UserService from "@services/users";

/**
 * Path parameters for single user endpoint
 */
export interface IGetTargetUserParameters {
    userId: string,
}

/**
 * Get a single user by ID (admin only)
 * GET /users/:userId
 *
 * @param request
 * @param response
 * @param next
 */
export const pageTargetUser = (request: Request & {
    params: IGetTargetUserParameters
}, response: Response, next: NextFunction) =>
    UserService.getById(request.params.userId)
        .then((user) => {
            if (!user)
                return next(new ExtendedError("404", 404, true, [ t("admin.user-not-found") ]));
            return successResponse(response, user);
        })
        .catch((error: CastError) => {
            if (error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError("404", 404, true, [ t("admin.user-not-found") ]));
            return next(databaseErrorConverter(error));
        });
