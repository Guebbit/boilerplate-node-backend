/**
 * @module
 * `DELETE /account/2fa` controller — thin HTTP adapter over `twoFactorService.disableTwoFactor`.
 */

import type { Request, Response } from 'express';
import { DisableTwoFactorBody } from '@api/schemas.zod';
import type { AuthTokens, TwoFactorCodeRequest } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { parseBody, refused, catchAs } from '@infrastructure/http/controller';
import { twoFactorService } from '../services';
import { remintSession, sessionSnapshotOf } from '../session/session';
import { authTwoFactorDisableTotal } from '../metrics';
import { t } from '@infrastructure/i18n';
import { callerContextOf } from '@infrastructure/http/request';
import { AMR, withProofs } from '../domain/session-proof';

/**
 * DELETE /account/2fa — drops every armed factor and the backup codes with them. Requires fresh
 * critical auth (the route guard) AND a valid code or backup code in the body: disabling from a
 * stolen-but-fresh session is otherwise the cheapest way around the whole feature.
 */
export const delete2fa = (
    request: Request<unknown, unknown, TwoFactorCodeRequest>,
    response: Response
) => {
    const { id, amr } = request.authContext!;

    const parsed = parseBody(DisableTwoFactorBody, request.body, response);
    if (!parsed) {
        authTwoFactorDisableTotal.inc({ method: 'all', status: 'failure' });
        return;
    }

    // Taken first: the change below deletes the session this request is signed in on.
    return sessionSnapshotOf(request, id)
        .then((snapshot) =>
            twoFactorService
                .disableTwoFactor(id, parsed.code, callerContextOf(request))
                .then((result) => {
                    if (refused(response, result)) {
                        authTwoFactorDisableTotal.inc({ method: 'all', status: 'failure' });
                        return;
                    }
                    authTwoFactorDisableTotal.inc({ method: 'all', status: 'success' });
                    // Disabling revoked every session, this one included: keep the caller in.
                    return remintSession(
                        request,
                        response,
                        id,
                        withProofs(amr, AMR.otp),
                        snapshot
                    ).then((issued) => {
                        successResponse<AuthTokens | undefined>(
                            response,
                            issued.sessionToken ? issued : undefined,
                            200,
                            t('account.two-factor.disabled')
                        );
                    });
                })
        )
        .catch(catchAs(response, 'delete2fa'));
};
