/**
 * @module
 * `POST /account/reauth/methods/{method}/send` controller — thin HTTP adapter over
 * `accountService.sendReauthCode`.
 */

import type { Request, Response } from 'express';
import { SendReauthCodeParams } from '@api/schemas.zod';
import type { TwoFactorDelivery } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { rejectValidation, refused, catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { accountService } from '../services';

/**
 * POST /account/reauth/methods/{method}/send — mails an account with no password the code that
 * lets it pass step-up. No fresh-auth guard, since this is how a stale session gets fresh; the
 * per-account delivery budget and the per-code cooldown are what bound it.
 */
export const postReauthMethodSend = (request: Request<{ method: string }>, response: Response) => {
    const { id } = request.authContext!;

    const pathParameters = SendReauthCodeParams.safeParse(request.params);
    if (!pathParameters.success) return rejectValidation(response, pathParameters.error);

    return accountService
        .sendReauthCode(id, pathParameters.data.method, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<TwoFactorDelivery>(
                response,
                result.data,
                200,
                t('account.two-factor.code-sent')
            );
        })
        .catch(catchAs(response, 'postReauthMethodSend'));
};
