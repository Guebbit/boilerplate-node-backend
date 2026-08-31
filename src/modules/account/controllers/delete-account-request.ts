/**
 * @module
 * `DELETE /account` controller — the authenticated user requests account deletion; sends a
 * confirmation email carrying a one-time token.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { userService } from '@modules/users';
import { accountService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { authAccountDeleteTotal } from '../metrics';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/**
 * Sends the account-deletion confirmation email; the token is minted and delivered by the
 * service, never returned here.
 * @param request - authenticated request (isAuth required)
 * @param response - Express response
 */
export const deleteAccountRequest = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { email } = authContextOf(request);

    return userService
        .findByEmail(email)
        .then((user) => {
            if (!user) {
                authAccountDeleteTotal.inc({ status: 'failure' });
                return successResponse(response, undefined, 200, t('account.delete.email-sent'));
            }
            return accountService
                .requestAccountDeletion(user, callerContextOf(request))
                .then(() => {
                    authAccountDeleteTotal.inc({ status: 'success' });
                    return successResponse(
                        response,
                        undefined,
                        200,
                        t('account.delete.email-sent')
                    );
                });
        })
        .catch(() => rejectResponse(response, 500, []));
};
