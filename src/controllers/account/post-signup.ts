import type { Request, Response, NextFunction } from 'express';
import { t } from 'i18next';
import { nodemailer } from '@utils/nodemailer';
import type { CastError } from 'mongoose';
import { databaseErrorConverter } from '@utils/helpers-errors';
import { deleteFile } from '@utils/helpers-filesystem';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { userService } from '@services/users';
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

    /**
     * Get URL of updated image: uploaded file takes priority over body imageUrl.
     * If no image was provided at all, fall back to an empty string.
     */
    const { imageUrlRaw, imageUrl: imageUrlFile } = resolveImageUrl(request as Request);
    const imageUrl = imageUrlFile ?? request.body.imageUrl ?? '';
    // If problem arises: remove the uploaded file (that can be missing so nothing happen)
    const deleteUpload = () => (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve(true));

    /**
     * Login
     */
    return userService.signup(email, username, password, passwordConfirm, imageUrl)
        .then(({ success, data, errors = [] }) => {
            if (!success || !data) {
                // So the user doesn't need to fill the form again
                request.flash('filled', [email, username]);
                request.flash('error', [t('login.invalid-data'), ...errors]);
                void deleteUpload();
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
