/**
 * @module
 * `POST /account/2fa/methods/{method}/send` controller — thin HTTP adapter over
 * `twoFactorService.sendMethodCode`.
 */

import type { Request, Response } from 'express';
import { SendTwoFactorMethodCodeParams } from '@api/schemas.zod';
import type { TwoFactorDelivery } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { rejectValidation, refused, catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { twoFactorService } from '../services';

/**
 * POST /account/2fa/methods/{method}/send — mails the signed-in caller a code for one armed
 * delivered method, so a holder of only that factor can prove it before changing their factors.
 * Fresh critical auth and the per-account delivery budget are the route's own guards.
 */
export const post2faMethodSend = (request: Request<{ method: string }>, response: Response) => {
    const { id } = request.authContext!;

    const pathParameters = SendTwoFactorMethodCodeParams.safeParse(request.params);
    if (!pathParameters.success) return rejectValidation(response, pathParameters.error);

    return twoFactorService
        .sendMethodCode(id, pathParameters.data.method, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<TwoFactorDelivery>(
                response,
                result.data,
                200,
                t('account.two-factor.code-sent')
            );
        })
        .catch(catchAs(response, 'post2faMethodSend'));
};
