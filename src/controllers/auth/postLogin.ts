import type { Request, Response } from 'express';
import { z } from "zod";
import { t } from "i18next";
import bcrypt from "bcrypt";
import Users, { UserSchema } from "../../models/users";

/**
 *
 */
export interface postLoginBodyParameters {
    email: string,
    password: string,
}

/**
 * Authenticate user
 *
 * @param req
 * @param res
 */
export default (req: Request<{}, {}, postLoginBodyParameters>, res: Response) => {
    const {
        email,
        password,
    } = req.body;

    // validation
    const parseResult = UserSchema.pick({
        email: true
    }).extend({
        password: z.string(),
    }).safeParse({
        email,
        password
    });

    // validation negative result
    if (!parseResult.success) {
        const { issues = [] } = parseResult.error;
        req.flash('error', issues.reduce((errorArray, { message }) => {
            errorArray.push(message);
            return errorArray;
        }, [] as string[]));
        return req.session.save(() => res.status(401).redirect('/account/login'));
    }

    // data is valid, proceed to check if identification exist and password is correct
    Users.findOne({
        where: {
            email,
        }
    })
        .then(user => {
            if (!user) {
                req.flash('error', [t('login.wrong-data')]);
                res.status(422).redirect('/account/login')
                return;
            }
            return bcrypt
                .compare(password, user.password)
                .then(doMatch => {
                    if (doMatch) {
                        return req.session.regenerate(() => {
                            req.session.user = user.dataValues
                            req.session
                                .save(() => {
                                    req.flash('success', [t('login.success')]);
                                    res.redirect('/')
                                });
                        });
                    }
                    req.flash('error', [t('login.wrong-data')]);
                    res.status(422).redirect('/account/login')
                })
        })
        .catch((error) => {
            console.log("postSignup ERROR", error);
            res.status(500).redirect('/errors/500-unknown');
        });
};