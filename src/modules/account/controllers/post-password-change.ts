import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { ChangePasswordBody } from '@api/schemas.zod';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import type { ChangePasswordRequest } from '@types';
import { accountService } from '../services';
import { authPasswordChangeTotal } from '../metrics';
import { rejectValidation } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/password
 * Change the authenticated user's password by proving the current one.
 *
 * The email reset proves possession of the mailbox; this proves possession of the credential
 * being replaced — no email round-trip, no token. Other sessions stay live, matching what the
 * contract says: revoking them is `logout-all`'s or the sessions endpoints' job.
 */
export const postPasswordChange = (
    request: Request<unknown, unknown, ChangePasswordRequest>,
    response: Response
) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = authContextOf(request);

    // Shape first: absent fields are a malformed request, not a wrong password.
    const parseResult = ChangePasswordBody.safeParse(request.body);
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
            if (!result.success) {
                authPasswordChangeTotal.inc({ status: 'failure' });
                rejectResponse(response, result.status, result.errors);
                return;
            }

            authPasswordChangeTotal.inc({ status: 'success' });
            successResponse(response, undefined, 200, t('account.password-change.success'));
        })
        .catch((error: CastError | Error) => {
            authPasswordChangeTotal.inc({ status: 'failure' });
            rejectDatabaseError(response, 'postPasswordChange', error);
        });
};
