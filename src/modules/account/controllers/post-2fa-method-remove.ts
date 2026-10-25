/**
 * @module
 * `POST /account/2fa/methods/{method}/remove` controller — thin HTTP adapter over
 * `twoFactorService.removeTwoFactorMethod`.
 */

import type { Request, Response } from 'express';
import { RemoveTwoFactorMethodBody, RemoveTwoFactorMethodParams } from '@api/schemas.zod';
import type { AuthTokens, TwoFactorCodeRequest } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { parseBody, refused, catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { twoFactorService } from '../services';
import { remintSession, sessionSnapshotOf } from '../session/session';
import { authTwoFactorDisableTotal } from '../metrics';
import { AMR, withProofs } from '../domain/session-proof';

/**
 * POST /account/2fa/methods/{method}/remove — drops one factor and leaves the rest armed. Fresh
 * critical auth AND a valid code, same reasoning as the full disable: a stolen-but-fresh session
 * must not be able to peel factors off one at a time either.
 */
export const post2faMethodRemove = (
    request: Request<{ method: string }, unknown, TwoFactorCodeRequest>,
    response: Response
) => {
    const { id, amr } = request.authContext!;

    const pathParameters = parseBody(RemoveTwoFactorMethodParams, request.params, response);
    if (!pathParameters) return;

    const body = parseBody(RemoveTwoFactorMethodBody, request.body, response);
    if (!body) {
        authTwoFactorDisableTotal.inc({ method: pathParameters.method, status: 'failure' });
        return;
    }
    const { method } = pathParameters;

    // Taken first: the change below deletes the session this request is signed in on.
    return sessionSnapshotOf(request, id)
        .then((snapshot) =>
            twoFactorService
                .removeTwoFactorMethod(id, method, body.code, callerContextOf(request))
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
                    ).then((issued) => {
                        successResponse<AuthTokens>(response, issued, 200);
                    });
                })
        )
        .catch(catchAs(response, 'post2faMethodRemove'));
};
