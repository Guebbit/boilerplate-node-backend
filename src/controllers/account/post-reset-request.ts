import type { Request, Response } from 'express';
import { t } from 'i18next';
import { userService } from '@services/users';
import { userRepository } from '@repositories/users';
import { successResponse } from '@utils/response';
import type { PasswordResetRequest } from '@types';
import { nodemailer } from '@utils/nodemailer';

export const postResetRequest = (
    request: Request<unknown, unknown, PasswordResetRequest>,
    response: Response
) => {
    const { email } = request.body;

    return (
        (
            email
                ? userRepository.findOne({ email }).then((user) =>
                      user
                          ? userService.tokenAdd(user, 'password', 3_600_000).then((token) => ({
                                username: user.username,
                                token
                            }))
                          : undefined
                  )
                : // eslint-disable-next-line unicorn/no-useless-undefined
                  Promise.resolve(undefined)
        )
            // silent — prevent email enumeration
            .catch(() => {
                // eslint-disable-next-line unicorn/no-useless-undefined
                return undefined;
            })
            .then((data) => {
                if (data?.token)
                    void nodemailer(
                        {
                            to: email,
                            subject: 'Password reset'
                        },
                        'email-reset-request.ejs',
                        {
                            ...response.locals,
                            pageMetaTitle: 'Password reset requested',
                            pageMetaLinks: [],
                            name: data.username,
                            token: data.token
                        }
                    );

                successResponse(response, undefined, 200, t('reset.email-sent'));
            })
    );
};
