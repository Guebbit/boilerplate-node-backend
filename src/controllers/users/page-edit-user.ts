import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import { databaseErrorConverter, ExtendedError } from "@utils/error-helpers";

import UserService from "@services/users";

/**
 * Url parameters
 */
export interface IGetEditUserParameters {
    userId?: string,
}

/**
 * Get user insertion page (admin only)
 * If userId is provided: it's an editing page
 *
 * @param request
 * @param response
 * @param next
 */
export const pageEditUser = (request: Request & {
    params: IGetEditUserParameters
}, response: Response, next: NextFunction) => {
    // Admin context: can see any user for editing (including soft-deleted)
    UserService.getById(request.params.userId)
        .then(user => {
            const [
                email,
                username,
                admin,
                imageUrl,
            ] = request.flash('filled');
            response.render('users/edit', {
                pageMetaTitle: user ? "Edit user" : "Add user",
                pageMetaLinks: [
                    "/css/forms.css"
                ],
                // old object (if any)
                user: user ?? {
                    // filled inputs (if any)
                    email,
                    username,
                    admin,
                    imageUrl,
                },
            });
        })
        .catch((error: Error) => {
            if (error.message == "404")
                return next(new ExtendedError("404", 404, true, [ t("admin.user-not-found") ]));
            return next(databaseErrorConverter(error));
        })
};
