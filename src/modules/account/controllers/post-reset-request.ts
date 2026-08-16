import type { Request, Response } from 'express';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import { RequestPasswordResetBody } from '@api/schemas.zod';
import { userService } from '@modules/users';
import { accountService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { PasswordResetRequest } from '@types';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { resetRequestEmail } from '../emails';
import { authPasswordResetTotal } from '../metrics';

/**
 * POST /account/reset-request
 * Indistinguishable response for valid and invalid emails — prevents user enumeration.
 */

/**
 * Resolve reset token data only when both email and user exist.
 * Returns undefined silently to keep the public response identical.
 * @param email - address from request body
 * @returns token payload or undefined
 */
const lookupResetData = (email?: string) => {
    if (!email) return Promise.resolve();
    return userService.findByEmail(email).then((user) => {
        if (!user) return;
        return accountService.tokenAdd(user, 'password', 3_600_000).then((token) => ({
            username: user.username,
            // The account's own language, so the email matches the rest of what this user
            // receives from us rather than the browser that happened to submit the form.
            locale: user.locale,
            token
        }));
    });
};

/**
 * Request handler — always resolves with 200 regardless of email validity.
 * Fires password-reset email only when a valid user + token pair was found.
 * @param request - Express request with PasswordResetRequest body
 * @param response - Express response
 */
export const postResetRequest = (
    request: Request<unknown, unknown, PasswordResetRequest>,
    response: Response
) => {
    // Shape validation only — existence of the account is never revealed (see below).
    const parseResult = RequestPasswordResetBody.safeParse(request.body);
    if (!parseResult.success)
        return rejectResponse(
            response,
            422,
            parseResult.error.issues.map(({ message }) => message)
        );

    const { email } = parseResult.data;

    return (
        lookupResetData(email)
            // Fail closed and keep the public response identical to protect account privacy.
            .catch(() => {
                /* error discarded intentionally — response stays 200 to prevent user enumeration */
            })
            .then((data) => {
                authPasswordResetTotal.inc({ status: data?.token ? 'success' : 'failure' });

                if (data?.token) {
                    // The recipient's own language, stated as an argument: the copy is finished
                    // before the job is published, so the worker needs no locale at all.
                    const mail = resetRequestEmail(
                        data.locale ?? request.locale ?? getDefaultLocale(),
                        data.username,
                        data.token
                    );
                    void enqueueEmail(
                        { to: email, subject: mail.subject },
                        mail.template,
                        mail.data
                    );
                }

                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: accountAuditActions.AUTH_PASSWORD_RESET_REQUESTED,
                        actor_user_id: 'anonymous',
                        actor_role: 'anonymous',
                        outcome: 'success'
                    })
                );

                successResponse(response, undefined, 200, t('account.reset.email-sent'));
            })
    );
};
