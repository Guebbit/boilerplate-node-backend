import type {Request, Response} from "express";
import type {CastError} from "mongoose";
import {t} from "i18next";
import Users, {EUserRoles, type IUser} from "../../models/users";
import {deleteFile} from "../../utils/helpers-filesystem";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import {rejectResponse, successResponse} from "../../utils/response";
import {getFormFiles} from "../../utils/helpers-files";

/**
 *
 */
export interface IGetEditUsersPostData {
    id?: string,
}


/**
 * Page POST data
 */
export interface IPostEditUsersPostData extends Omit<IUser, "roles" | "active"> {
    id?: string,
    roles?: EUserRoles[] | string,
    password: string,
    passwordConfirm: string,
    active?: "0" | "1",
}

/**
 *
 * @param req
 * @param res
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export default async (req: Request<IGetEditUsersPostData | {}, unknown, Partial<IPostEditUsersPostData>>, res: Response) => {
    /**
     * get POST data
     */
    const {
        email,
        username,
        password,
        passwordConfirm,
        phone,
        website,
        language,
    } = req.body;
    const active = req.body.active ? req.body.active === "1" : undefined;
    const id = (req.params as IGetEditUsersPostData).id ?? req.body.id;
    const roles =
        req.body.roles ?
            (
                Array.isArray(req.body.roles) ?
                    req.body.roles :
                    req.body.roles.split(",") as EUserRoles[]
            ) : undefined;
    const createMode = !id || id === '';


    // if no admin:
    if (
        !req.user?.roles.includes(EUserRoles.ADMIN) &&
        (
            // it must be the current user info that are requested
            req.user?.id !== id ||
            // It can't decide the following admin-only fields
            active ||
            (roles && roles.length > 0)
        )
    ) {
        rejectResponse(res, 403, t("generic.error-forbidden"))
        return;
    }

    // if password or passwordConfirm are set, they must match
    if ((password || passwordConfirm) && password !== passwordConfirm) {
        rejectResponse(res, 403, t("signup.password-dont-match"))
        return;
    }

    /**
     * Get URL of updated image it's on req.file,
     * but it's good to know that it could be within an array
     * If no image was uploaded: it's empty
     * If image was uploaded: delete the old one (if any) on save
     */
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const imageUrlRaw = getFormFiles(req as Request)?.[0] as string | undefined;
    // remove "public" at root ("/" remain as root)
    const imageUrl = imageUrlRaw ? imageUrlRaw.replace((process.env.NODE_PUBLIC_PATH ?? "public"), "") : "";

    /**
     * Data validation
     */
    const issues = Users.validateData({
        email,
        username,
        password,
        phone,
        website,
        language,
        imageUrl,
        active,
    }, !createMode);

    /**
     * Validation error
     */
    if (issues.length > 0) {
        // Record was not created, so revert server changes by removing the uploaded file
        if (imageUrlRaw && imageUrlRaw.length > 0)
            await deleteFile(imageUrlRaw);
        rejectResponse(res, 404, "errors", issues);
        return;
    }

    /**
     * NO ID = new user
     */
    if (createMode)
        Users.create({
            email,
            username,
            password,
            phone,
            website,
            language,
            imageUrl,
            roles,
            cart: {'items': []},
            tokens: [],
            active,
        })
            .then((user) => successResponse(res, user.toJSON()))
            .catch(async (error: CastError) => {
                if (imageUrlRaw && imageUrlRaw.length > 0)
                    await deleteFile(imageUrlRaw);
                return rejectResponse(res, ...databaseErrorInterpreter(error))
            });
    /**
     * ID = edit user
     */
    else
        Users.findById(id)
            .select("+password")
            .then(async (user) => {
                if (!user) {
                    rejectResponse(res, 404, t("users.user-not-found"))
                    return
                }

                // if empty: no image was uploaded
                const oldImageUrl = user.imageUrl;
                const imageIsUploaded = oldImageUrl && imageUrl && oldImageUrl !== imageUrl;
                if (imageIsUploaded)
                    user.imageUrl = imageUrl;
                if (email)
                    user.email = email;
                if (username)
                    user.username = username;
                if (password)
                    user.password = password; // it will be hashed by the schema
                if (phone)
                    user.phone = phone;
                if (website)
                    user.website = website;
                if (language)
                    user.language = language;
                if (roles)
                    user.roles = roles;
                if(active !== undefined)
                    user.active = active;

                // save the updated user
                await user.save();
                // after saving the new user image, delete the old one
                if (imageIsUploaded)
                    await deleteFile((process.env.NODE_PUBLIC_PATH ?? "public") + oldImageUrl);

                // Get new user data. Would be the same as returning user.save() but like this we have more control
                return successResponse(
                    res,
                    await Users.findById(id)
                        .lean({virtuals: true})
                )
            })
            .catch(async (error: CastError) => {
                if (imageUrlRaw && imageUrlRaw.length > 0)
                    await deleteFile(imageUrlRaw);
                if (error.message == "404" || error.kind === "ObjectId")
                    return rejectResponse(res, 404, t("users.user-not-found"))
                return rejectResponse(res, ...databaseErrorInterpreter(error))
            });
};