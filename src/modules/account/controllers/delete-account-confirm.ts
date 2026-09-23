/**
 * @module
 * `DELETE /account/delete-confirm` controller — spends the one-time deletion token and hard-deletes
 * the account.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { ConfirmAccountDeleteBody } from '@api/schemas.zod';
import { accountService, ACCOUNT_DELETE_TOKEN_TYPE } from '../services';
import { destroyRefreshCookie, destroyLoggedCookie } from '../session/cookies';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import type { AccountDeleteConfirmRequest } from '@types';
import { parseBody } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * DELETE /account/delete-confirm
 * Validate the one-time deletion token and permanently remove the account.
 */
export const deleteAccountConfirm = (
    request: Request<unknown, unknown, AccountDeleteConfirmRequest>,
    response: Response
) => {
    const body = parseBody(ConfirmAccountDeleteBody, request.body, response);
    if (!body) return;

    const { token } = body;

    return accountService
        .redeemLiveToken(ACCOUNT_DELETE_TOKEN_TYPE, token)
        .then((user) => {
            if (!user) {
                rejectResponse(response, 422, [t('account.delete.token-not-found')]);
                return;
            }

            /*
             * Hard-delete the account. The goodbye mail is published by the service, which is also
             * the only layer that can still read the address: after this resolves there is no
             * document left to take one from.
             */
            return accountService.removeOwnAccount(user, callerContextOf(request)).then(() => {
                destroyRefreshCookie(response);
                destroyLoggedCookie(response);
                successResponse<undefined>(response, undefined, 200, t('account.delete.success'));
            });
        })
        .catch((error: unknown) => {
            // Same interpreter every other write path answers through, so a recognised database
            // failure gets its own status rather than a flat 500.
            rejectDatabaseError(response, 'deleteAccountConfirm', error);
        });
};
