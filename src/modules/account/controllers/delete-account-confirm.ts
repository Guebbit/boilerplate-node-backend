/**
 * @module
 * `DELETE /account/delete-confirm` controller — spends the one-time deletion token and hard-deletes
 * the account.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { ConfirmAccountDeleteBody } from '@api/schemas.zod';
import { accountService } from '../services';
import { destroyRefreshCookie, destroyLoggedCookie } from '../session/cookies';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { AccountDeleteConfirmRequest } from '@types';
import { parseBody } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/** The `tokens.type` an account-deletion link carries. */
const ACCOUNT_DELETE_TOKEN_TYPE = 'delete';

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

    /** Every refusal answers identically — see the note in `services/tokens.ts`. */
    const refuseToken = () => {
        rejectResponse(response, 422, [t('account.delete.token-not-found')]);
    };

    return accountService
        .findLiveToken(ACCOUNT_DELETE_TOKEN_TYPE, token)
        .then((user) => {
            if (!user) {
                refuseToken();
                return;
            }

            return accountService.spendLiveToken(user, token).then((spentByThisRequest) => {
                if (!spentByThisRequest) {
                    refuseToken();
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
                    successResponse(response, undefined, 200, t('account.delete.success'));
                });
            });
        })
        .catch(() => rejectResponse(response, 500, []));
};
