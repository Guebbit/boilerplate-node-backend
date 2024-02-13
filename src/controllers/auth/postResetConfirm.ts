import type { Request, Response } from 'express';
import { t } from "i18next";
import { z } from "zod";
import Users, { UserSchema } from "../../models/users";
import Tokens from "../../models/tokens";
import bcrypt from "bcrypt";

/**
 * Check password is valid and passwordConfirm is equal
 */
export const UserResetPasswordSchema = UserSchema
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
export interface postResetConfirmBodyParameters {
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
export default (req: Request<{}, {}, postResetConfirmBodyParameters>, res: Response) =>
    Tokens.findOne({
        where: {
            token: req.body.token
        }
    })
        .then(token => {
            const {
                password,
                passwordConfirm,
            } = req.body;

            // wrong token
            if (!token) {
                req.flash('error', [t("reset.token-not-found")]);
                res.redirect('/account/reset')
                return;
            }

            // check if password and passwordConfirm are compliant
            const parseResult = UserResetPasswordSchema
                .safeParse({
                    password,
                    passwordConfirm
                });

            // validation negative result
            if (!parseResult.success) {
                const { issues = [] } = parseResult.error;
                req.flash('error', issues.reduce((errorArray, {message}) => {
                    errorArray.push(message);
                    return errorArray;
                }, [] as string[]));
                res.redirect('/account/reset')
                return;
            }

            // Everything is ok, change password with the requested one
            return token.getUser()
                .then((user) => {
                    // apply change
                    bcrypt.hash(password, 12)
                        .then(hashedPassword => {
                            user.password = hashedPassword;
                            return user.save();
                        })
                    // no need to wait for the password to be changed
                    req.flash('success', [t("reset.success")]);
                    res.redirect("/account/login");
                    //save changes (don't update session.user, not needed)
                })
                // consume the token upon use
                .then(() => token.destroy())
                .catch(() => {
                    // It should be impossible for this error to happen
                    throw Error(t("reset.token-not-found"))
                })
        })
        .catch(err => {
            console.log("postResetConfirm ERROR", err)
            req.flash('error', [t("generic.unknown-error")]);
            res.redirect('/account/reset')
            return;
        });
