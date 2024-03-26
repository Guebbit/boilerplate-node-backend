import type { Request, Response } from 'express';
import { t } from "i18next";
import { z } from "zod";
import Users, { ZodUserSchema } from "../../models/users";
import Tokens from "../../models/tokens";
import nodemailer from "../../utils/nodemailer";

/**
 * Check password is valid and passwordConfirm is equal
 */
export const UserResetPasswordSchema = ZodUserSchema
    .pick({
        password: true,
    })
    .extend({
        passwordConfirm: z.string(),
    })
    .superRefine(({passwordConfirm, password}, ctx) => {
        if (passwordConfirm !== password) {
            ctx.addIssue({
                code: "custom",
                message: t("signup.password-dont-match")
            });
        }
    });

/**
 *
 */
export interface IPostResetConfirmPostData {
    token: string,
    password: string,
    passwordConfirm: string,
}

/**
 * Ask to guest if they want to reset the password
 *
 * @param req
 * @param res
 */
export default (req: Request<unknown, unknown, IPostResetConfirmPostData>, res: Response) => {
    /**
     * Post Data
     */
    const {
        password,
        passwordConfirm,
        token
    } = req.body;

    /**
     * Search user by token
     */
    return Tokens.findOne({
        where: {
            token
        },
        include: [
            Users
        ]
    })
        .then(token => {
            // retrieving User
            const { User } = token as Tokens & { User: Users } | null || {};
            // wrong token
            if (!token || !User) {
                req.flash('error', [t("reset.token-not-found")]);
                res.redirect('/account/reset')
                return;
            }
            // change password
            return User.passwordChange(password, passwordConfirm)
                .then(() => {
                    // consume the token
                    token.destroy();
                    // send confirmation email (no need to wait)
                    nodemailer({
                            to: User.email,
                            subject: 'Password change confirmed',
                        },
                        "emailResetConfirm.ejs",
                        {
                            ...res.locals,
                            pageMetaTitle: 'Password change confirmed',
                            pageMetaLinks: [],
                            name: User.username,
                        });
                    // success message
                    req.flash('success', [t("reset.success")]);
                    res.redirect("/account/login");
                })
                .catch((issues :string[] = []) => {
                    req.flash('error', issues);
                    res.redirect('/account/reset');
                    return;
                });
        })
        .catch(err => {
            console.log("postResetConfirm ERROR", err)
            req.flash('error', [t("generic.error-unknown")]);
            res.redirect('/account/reset')
            return;
        });
}
