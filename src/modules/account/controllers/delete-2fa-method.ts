/**
 * @module
 * `DELETE /account/2fa/methods/{method}` controller — thin HTTP adapter over
 * `twoFactorService.removeTwoFactorMethod`.
 */

import type { Request, Response } from 'express';
import { RemoveTwoFactorMethodBody, RemoveTwoFactorMethodParams } from '@api/schemas.zod';
import type { TwoFactorCodeRequest } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { rejectValidation, refused, catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { twoFactorService } from '../services';
import { remintSession, sessionSnapshotOf } from '../session/session';
import { authTwoFactorDisableTotal } from '../metrics';
import { AMR, withProofs } from '../domain/session-proof';

/**
 * DELETE /account/2fa/methods/{method} — drops one factor and leaves the rest armed. Fresh
 * critical auth AND a valid code, same reasoning as the full disable: a stolen-but-fresh session
 * must not be able to peel factors off one at a time either.
 */
export const delete2faMethod = (
    request: Request<{ method: string }, unknown, TwoFactorCodeRequest>,
    response: Response
) => {
    const { id, amr } = request.authContext!;

    const pathParameters = RemoveTwoFactorMethodParams.safeParse(request.params);
    if (!pathParameters.success) return rejectValidation(response, pathParameters.error);

    const body = RemoveTwoFactorMethodBody.safeParse(request.body);
    if (!body.success) {
        authTwoFactorDisableTotal.inc({ method: pathParameters.data.method, status: 'failure' });
        return rejectValidation(response, body.error);
    }
    const { method } = pathParameters.data;

    // Taken first: the change below deletes the session this request is signed in on.
    return sessionSnapshotOf(request, id)
        .then((snapshot) =>
            twoFactorService
                .removeTwoFactorMethod(id, method, body.data.code, callerContextOf(request))
                .then((result) => {
                    if (refused(response, result)) {
                        authTwoFactorDisableTotal.inc({ method, status: 'failure' });
                        return;
                    }
                    authTwoFactorDisableTotal.inc({ method, status: 'success' });
                    // Removing a factor revoked every session, this one included: keep the caller in.
                    return remintSession(
                        request,
                        response,
                        id,
                        withProofs(amr, AMR.otp),
                        snapshot
                    ).then(() => {
                        successResponse<undefined>(
                            response,
                            undefined,
                            200,
                            t('account.two-factor.method-removed')
                        );
                    });
                })
        )
        .catch(catchAs(response, 'delete2faMethod'));
};
