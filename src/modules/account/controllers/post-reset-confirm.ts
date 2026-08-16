import type { Request, Response } from 'express';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import { ConfirmPasswordResetBody } from '@api/schemas.zod';
import { userService } from '@modules/users';
import { accountService } from '../services';
import { destroyRefreshCookie, destroyLoggedCookie } from '../session/cookies';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { PasswordResetConfirmRequest } from '@types';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { resetConfirmEmail } from '../emails';

/**
 * POST /account/reset-confirm
 * Validate a one-time reset token and set the new password.
 */
export const postResetConfirm = (
    // This token is provided in the url within the email that has been sent to the user
    request: Request<{ token?: string }, unknown, PasswordResetConfirmRequest>,
    response: Response
) => {
    const parseResult = ConfirmPasswordResetBody.safeParse(request.body);
    if (!parseResult.success)
        return rejectResponse(
            response,
            422,
            parseResult.error.issues.map(({ message }) => message)
        );

    const { token, password, passwordConfirm } = parseResult.data;

    /**
     * Search user by token
     */
    return userService
        .findByPasswordResetToken(token)
        .then((user) => {
            // Wrong token
            if (!user) {
                rejectResponse(response, 422, [t('account.reset.token-not-found')]);
                return;
            }

            const tokenEntry = user.tokens.find(
                (tk) => tk.token === token && tk.type === 'password'
            );
            if (!tokenEntry || (tokenEntry.expiration && tokenEntry.expiration < new Date())) {
                rejectResponse(response, 422, [t('account.reset.token-not-found')]);
                return;
            }

            /*
             * Validate BEFORE spending the token, then let spending it decide the race.
             *
             * The lookup above is a read, so two simultaneous confirms of one reset link both
             * find the token and both pass this point — a one-time token used twice. Only the
             * atomic `$pull` inside `consumeToken` can separate them: it reports whether THIS
             * request was the one that removed the entry, and the loser is turned away with the
             * same "token not found" it would get for an invented token, because from its point
             * of view that is exactly what happened.
             *
             * Validation comes first so a mistyped confirmation cannot burn the link. Password
             * writing comes last, so the request that loses the race never changes anything.
             */
            const errors = accountService.validatePasswordChange(password, passwordConfirm);
            if (errors.length > 0) {
                rejectResponse(response, 422, errors);
                return;
            }

            return userService.consumeToken(user, token).then((spentByThisRequest) => {
                if (!spentByThisRequest) {
                    rejectResponse(response, 422, [t('account.reset.token-not-found')]);
                    return;
                }

                /**
                 * Change password
                 */
                return accountService
                    .passwordChange(user, password, passwordConfirm)
                    .then((result) => {
                        if (!result.success) {
                            rejectResponse(response, result.status, result.errors);
                            return;
                        }
                        // send confirmation email (no need to wait)
                        /*
                         * The recipient's OWN language, not the language of the request that triggered
                         * this. These links are clicked from an email client, possibly on a shared or
                         * borrowed device, so the browser's `Accept-Language` says very little about
                         * who the message is for. Passing it explicitly is what makes that choice
                         * visible — and what leaves the job fully translated.
                         */
                        const mail = resetConfirmEmail(
                            user.locale ?? request.locale ?? getDefaultLocale(),
                            user.username
                        );
                        void enqueueEmail(
                            { to: user.email, subject: mail.subject },
                            mail.template,
                            mail.data
                        );

                        emitAuditEvent(
                            buildAuditEvent(request, {
                                action: accountAuditActions.AUTH_PASSWORD_RESET_COMPLETED,
                                actor_user_id: String(user._id),
                                actor_role: user.admin ? 'admin' : 'user',
                                outcome: 'success'
                            })
                        );

                        destroyRefreshCookie(response);
                        destroyLoggedCookie(response);
                        successResponse(response, undefined, 200, t('account.reset.success'));
                    });
            });
        })
        .catch(() => {
            rejectResponse(response, 500, []);
        });
};
