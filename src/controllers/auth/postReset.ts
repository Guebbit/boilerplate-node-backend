import type { Request, Response } from 'express';
import { randomBytes } from "crypto";
import { t } from "i18next";
import { z } from "zod";
import Users, { UserSchema } from "../../models/users";
import Tokens from "../../models/tokens";

/**
 *
 */
export interface postResetBodyParameters {
    email: string,
}

/**
 * Ask to guest if they want to reset the password
 *
 * @param req
 * @param res
 */
export default (req: Request<{}, {}, postResetBodyParameters>, res: Response) =>
    Users.findOne({
        where: {
            email: req.body.email
        }
    })
        .then((user) => {
            if(!user) {
                req.flash('error', [t('reset.email-not-found')]);
                return res.redirect('/account/reset');
            }

            // no need to wait for the DB to be updated and mail sent
            req.flash('success', [t('reset.email-sent')]);
            // workaround to show req.flash when redirecting on the same route
            res.redirect('/account/reset')

            // nested, for better order
            user.createToken({
                type: "password",
                token: randomBytes(16).toString('hex'),
                expiration: Date.now() + 3600000,
            })
                .then((token: Tokens) => {
                    console.log("Tokens.create OK", token.dataValues);
                    // TODO send mail
                    // transporter.sendMail({
                    //     to: req.body.email,
                    //     from: 'shop@node-complete.com',
                    //     subject: 'Password reset',
                    //     html: `
                    //         <p>You requested a password reset</p>
                    //         <p>Click this <a href="http://localhost:3000/reset/${token}">link</a> to set a new password.</p>
                    //       `
                    // });
                })
                .catch((err: string) => console.log("postReset Tokens.create ERROR", err));
        })
        .catch((err) => console.log("postReset Users.findOne ERROR", err));

