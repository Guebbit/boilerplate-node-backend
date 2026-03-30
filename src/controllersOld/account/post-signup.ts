import type {Request, Response} from 'express';
import type {CastError} from "mongoose";
import {t} from "i18next";
import Users, {IUser} from "../../models/users";
import nodemailer from "../../utils/nodemailer";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import {rejectResponse, successResponse} from "../../utils/response";
import {getFormFiles} from "../../utils/helpers-files";
import {deleteFile} from "../../utils/helpers-filesystem";

export interface IPostSignupPostData extends Pick<IUser, "email" | "username" | "phone" | "website" | "language"> {
    password: string,
    passwordConfirm: string,
}

/**
 * Register new user
 *
 * @param req
 * @param res
 */
export default async (req: Request<unknown, unknown, IPostSignupPostData>, res: Response) => {

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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const imageUrlRaw = getFormFiles(req as Request)?.[0] as string | undefined;
    // remove "public" at root ("/" remain as root)
    const imageUrl = imageUrlRaw ? imageUrlRaw.replace((process.env.NODE_PUBLIC_PATH ?? "public"), "") : "";

    /**
     * Login
     */
    await Users.signup(
        email,
        username,
        password,
        passwordConfirm,
        phone,
        website,
        language,
        imageUrl
    )
        .then(async ({success, status, data, errors = []}) => {
            if (!success){
                // Record was not created, so revert server changes by removing the uploaded file
                if (imageUrlRaw && imageUrlRaw.length > 0)
                    await deleteFile(imageUrlRaw);
                return rejectResponse(res, status, "Invalid Data", errors);
            }
            // Registration confirmation (no need to wait)
            if (process.env.NODE_ENV !== "test")
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                nodemailer({
                        to: data!.email,
                        subject: 'Signup succeeded!',
                    },
                    "email-registration-confirm.ejs",
                    {
                        ...res.locals,
                        pageMetaTitle: 'Signup succeeded!',
                        pageMetaLinks: [],
                        name: data!.username,
                    })
            // Registration successful
            return successResponse(res, data, 201, t('signup.registration-successful'));
        })
        .catch((error: Error | CastError) => rejectResponse(res, ...databaseErrorInterpreter(error)))
};