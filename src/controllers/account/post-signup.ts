import type { Request, Response, NextFunction } from 'express';
import { t } from 'i18next';
import { nodemailer } from '@utils/nodemailer';
import type { CastError } from 'mongoose';
import { databaseErrorConverter } from '@utils/helpers-errors';
import { deleteFile } from '@utils/helpers-filesystem';
import { resolveImageUrl } from '@utils/helpers-uploads';
import UserService from '@services/users';
import type { SignupRequest, SignupRequestMultipart } from '@types';

/**
 * Register new user
 *
 * @param request
 * @param response
 * @param next
 */
export const postSignup = async (
    request: Request<unknown, unknown, SignupRequest | SignupRequestMultipart>,
    response: Response,
    next: NextFunction
) => {
    /**
     * Get POST data
     */
    const { email, username, password, passwordConfirm } = request.body;
    const imageUrlBody = request.body.imageUrl;

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request as Request);

    /**
     * Login
     */
    return UserService.signup(email, username, password, passwordConfirm, imageUrl ?? imageUrlBody)
        .then(({ success, data, errors = [] }) => {
            if (!success || !data) {
                // So the user doesn't need to fill the form again
                request.flash('filled', [email, username]);
                request.flash('error', [t('login.invalid-data'), ...errors]);
                if (imageUrlRaw) void deleteFile(imageUrlRaw);
                return response.redirect('/account/signup');
            }
            // Registration confirmation (no need to wait)

            nodemailer(
                {
                    to: data.email,
                    subject: 'Signup succeeded!'
                },
                'email-registration-confirm.ejs',
                {
                    ...response.locals,
                    pageMetaTitle: 'Signup succeeded!',
                    pageMetaLinks: [],
                    name: data.username
                }
            );
            // Registration successful,
            // send to the login and
            request.flash('success', [t('signup.registration-successful')]);
            return response.redirect('/account/login');
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));
};
