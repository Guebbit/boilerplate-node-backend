import type { Request, Response } from 'express';
import { z } from "zod";
import { t } from "i18next";
import bcrypt from "bcrypt";
import Users, { UserSchema } from "../../models/users";

export interface postSignupBodyParameters {
    email: string,
    username: string,
    imageUrl: string,
    password: string,
    passwordConfirm: string,
}

/**
 * Add passwordConfirm to confirm (valid) password
 */
export const UserRegistrationSchema = UserSchema
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
 * Registration of new user
 *
 * @param req
 * @param res
 */
export default async (req: Request<{}, {}, postSignupBodyParameters>, res: Response) => {
    // get POST data
    const {
        email,
        username,
        imageUrl,
        password,
        passwordConfirm,
    } = req.body;

    // validation
    const parseResult = UserRegistrationSchema
        .safeParse({
            email,
            username,
            imageUrl,
            password,
            passwordConfirm,
        })

    // validation negative result
    if (!parseResult.success) {
        const { issues = [] } = parseResult.error;
        req.flash('error', issues.reduce((errorArray, { message }) => {
            errorArray.push(message);
            return errorArray;
        }, [] as string[]));
        req.flash('filled', [
            email,
            username,
            imageUrl,
        ]);
        return res.status(422).redirect('/account/signup');
    }

    // check if email is already used
    return Users.findOne({
        where: {
            email,
        }
    })
        .then((user) => {
            if (user) {
                req.flash('error', [t('signup.email-already-used')]);
                return res.redirect('/account/signup');
            }
            // everything is ok, proceed to create a new user.
            // Encrypt password and save in database
            return bcrypt.hash(password, 12)
                .then(hashedPassword =>
                    new Users({
                        username,
                        email,
                        imageUrl,
                        password: hashedPassword,
                    }).save()
                )
                .then(user => {
                    user.createCart();
                    // Registration successful,
                    // send to the login and wait email confirmation
                    req.flash('success', [t('signup.registration-successful')]);
                    return res.redirect('/account/login');
                    // TODO
                    // return transporter.sendMail({
                    //   to: email,
                    //   from: 'shop@node-complete.com',
                    //   subject: 'Signup succeeded!',
                    //   html: '<h1>You successfully signed up!</h1>'
                    // });
                });
        })
        .catch((error) => {
            console.log("postSignup ERROR", error)
            res.status(500).redirect('/errors/500-unknown');
        });
};