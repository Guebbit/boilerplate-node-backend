/**
 * @module
 * `DELETE /account/oauth/links/{provider}` controller — thin HTTP adapter over
 * `accountService.unlinkOAuthProvider`.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { accountService } from '../services';

/**
 * DELETE /account/oauth/links/{provider}
 * Disconnects one provider from the caller's account; 404 when it was not linked. The route
 * mounts a fresh-session guard: removing a way in is an identity change.
 */
export const deleteOAuthLink = (request: Request<{ provider: string }>, response: Response) =>
    accountService
        .unlinkOAuthProvider(
            request.authContext!.id,
            request.params.provider,
            callerContextOf(request)
        )
        .then((removed) => {
            if (!removed) {
                rejectResponse(response, 404, [t('account.oauth.link-not-found')]);
                return;
            }
            successResponse<undefined>(response, undefined, 200, t('account.oauth.link-removed'));
        })
        .catch(catchAs(response, 'deleteOAuthLink'));
