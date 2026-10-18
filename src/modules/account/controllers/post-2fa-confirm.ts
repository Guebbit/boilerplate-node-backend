/**
 * @module
 * `POST /account/2fa/methods/{method}/confirm` controller — thin HTTP adapter over
 * `twoFactorService.confirmTwoFactorMethod`.
 */

import type { Request, Response } from 'express';
import { ConfirmTwoFactorMethodBody, ConfirmTwoFactorMethodParams } from '@api/schemas.zod';
import type { TwoFactorConfirmed, TwoFactorConfirmRequest } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { parseBody, refused, catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { twoFactorService } from '../services';
import { remintSession, sessionSnapshotOf } from '../session/session';
import { authTwoFactorEnrollTotal } from '../metrics';
import { AMR, withProofs } from '../domain/session-proof';

/**
 * POST /account/2fa/methods/{method}/confirm — arms the pending method against a code the caller
 * has demonstrably received, and returns backup codes if this was the account's first factor.
 */
export const post2faConfirm = (
    request: Request<{ method: string }, unknown, TwoFactorConfirmRequest>,
    response: Response
) => {
    const { id, amr } = request.authContext!;

    const pathParameters = parseBody(ConfirmTwoFactorMethodParams, request.params, response);
    if (!pathParameters) return;

    const body = parseBody(ConfirmTwoFactorMethodBody, request.body, response);
    if (!body) {
        authTwoFactorEnrollTotal.inc({ method: pathParameters.method, status: 'failure' });
        return;
    }
    const { method } = pathParameters;

    // Taken first: the change below deletes the session this request is signed in on.
    return sessionSnapshotOf(request, id)
        .then((snapshot) =>
            twoFactorService
                .confirmTwoFactorMethod(id, method, body.code, callerContextOf(request))
                .then((result) => {
                    if (refused(response, result)) {
                        authTwoFactorEnrollTotal.inc({ method, status: 'failure' });
                        return;
                    }

                    authTwoFactorEnrollTotal.inc({ method, status: 'success' });
                    // Arming a factor revoked every session, this one included: keep the caller in.
                    return remintSession(
                        request,
                        response,
                        id,
                        withProofs(amr, AMR.otp),
                        snapshot
                    ).then((issued) => {
                        successResponse<TwoFactorConfirmed>(
                            response,
                            { ...result.data, ...issued },
                            200,
                            t('account.two-factor.method-added')
                        );
                    });
                })
        )
        .catch(catchAs(response, 'post2faConfirm'));
};
