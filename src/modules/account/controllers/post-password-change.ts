/**
 * @module
 * `POST /account/password` controller — thin HTTP adapter over
 * `accountService.passwordChangeWithCurrent`.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { ChangePasswordBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import type { ChangePasswordRequest, AuthTokens } from '@types';
import { accountService } from '../services';
import { issueSession } from '../session/session';
import { authPasswordChangeTotal } from '../metrics';
import { rejectValidation, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * The contract's field list with its content rules dropped, for the shape check below.
 *
 * `ChangePasswordBody`'s generated `minLength` would refuse first, and the global error map
 * renders that as the GENERIC size sentence — shadowing the field's own copy, which
 * `accountService.validatePasswordChange` gives. Derived from the contract, so a field added there
 * still has to be accounted for here.
 */
const changePasswordShape = ChangePasswordBody.extend({
    currentPassword: z.string(),
    password: z.string(),
    passwordConfirm: z.string()
});

/**
 * POST /account/password — changes the password by proving the current one (no email
 * round-trip, unlike the reset flow). The service revokes every
 * OTHER session, and this controller re-mints the caller's own — signing them out of the tab
 * they are typing in would be a bug, not a security win.
 */
export const postPasswordChange = (
    request: Request<unknown, unknown, ChangePasswordRequest>,
    response: Response
) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;

    // Shape first: absent fields are a malformed request, not a wrong password. Content rules
    // are the service's, which answers in the caller's language.
    const parseResult = changePasswordShape.safeParse(request.body);
    if (!parseResult.success) {
        authPasswordChangeTotal.inc({ status: 'failure' });
        return rejectValidation(response, parseResult.error);
    }

    const { currentPassword, password, passwordConfirm } = parseResult.data;

    return accountService
        .passwordChangeWithCurrent(
            id,
            currentPassword,
            password,
            passwordConfirm,
            callerContextOf(request)
        )
        .then((result) => {
            if (refused(response, result)) {
                authPasswordChangeTotal.inc({ status: 'failure' });
                return;
            }

            /*
             * The password write and the revoke have both already succeeded by this point —
             * only the re-mint is left. If IT fails, the response must still say success: the
             * caller's password DID change, and every prior session is already gone either way.
             * A 500 here would tell them the opposite of what happened, so a failed re-mint
             * degrades to "no new token" rather than "the change failed".
             */
            return issueSession(response, id)
                .then((token) => {
                    authPasswordChangeTotal.inc({ status: 'success' });
                    successResponse<AuthTokens>(
                        response,
                        { token },
                        200,
                        t('account.password-change.success')
                    );
                })
                .catch((error: unknown) => {
                    // Still a real fact worth finding — a swallowed re-mint failure had no
                    // trail at all before this, even though the degrade to 200 above is correct.
                    logger.warn({
                        message: 'Password changed, but the session re-mint failed.',
                        userId: id,
                        error
                    });
                    authPasswordChangeTotal.inc({ status: 'success' });
                    successResponse(response, undefined, 200, t('account.password-change.success'));
                });
        })
        .catch((error: unknown) => {
            authPasswordChangeTotal.inc({ status: 'failure' });
            rejectDatabaseError(response, 'postPasswordChange', error);
        });
};
