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
 *
 * No separate spend: this is a hard delete, so the write that ends the flow takes the token with
 * the document it lives on. Two simultaneous clicks are settled by the delete itself — the second
 * finds nothing to remove.
 */
export const deleteAccountConfirm = (
    request: Request<unknown, unknown, AccountDeleteConfirmRequest>,
    response: Response
) => {
    const body = parseBody(ConfirmAccountDeleteBody, request.body, response);
    if (!body) return;

    const { token } = body;

    return accountService
        .findLiveToken(ACCOUNT_DELETE_TOKEN_TYPE, token)
        .then((user) => {
            // Every refusal answers identically — see the note in `services/tokens.ts`.
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
                successResponse(response, undefined, 200, t('account.delete.success'));
            });
        })
        .catch(() => rejectResponse(response, 500, []));
};
