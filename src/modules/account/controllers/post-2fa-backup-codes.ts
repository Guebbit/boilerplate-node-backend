/**
 * @module
 * `POST /account/2fa/backup-codes` controller — thin HTTP adapter over
 * `accountService.regenerateBackupCodes`.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { RegenerateBackupCodesBody } from '@api/schemas.zod';
import type { TwoFactorBackupCodesRegenerated, TwoFactorCodeRequest } from '@types';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { rejectValidation } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { accountService } from '../services';
import { authTwoFactorBackupCodesRegenerateTotal } from '../metrics';

/**
 * POST /account/2fa/backup-codes — mints a fresh set of ten backup codes, discarding the old
 * ones. Fresh critical auth AND a valid code, same reasoning `delete2fa` gives.
 */
export const post2faBackupCodes = (
    request: Request<unknown, unknown, TwoFactorCodeRequest>,
    response: Response
) => {
    const { id } = authContextOf(request);

    const body = RegenerateBackupCodesBody.safeParse(request.body);
    if (!body.success) {
        authTwoFactorBackupCodesRegenerateTotal.inc({ status: 'failure' });
        return rejectValidation(response, body.error);
    }

    return accountService
        .regenerateBackupCodes(id, body.data.code, callerContextOf(request))
        .then((result) => {
            if (!result.success) {
                authTwoFactorBackupCodesRegenerateTotal.inc({ status: 'failure' });
                rejectResponse(response, result.status, result.errors);
                return;
            }

            const { data } = result;
            if (data === undefined) {
                // A success verdict without codes is a broken service contract, not a bad request.
                rejectResponse(response, 500, []);
                return;
            }

            authTwoFactorBackupCodesRegenerateTotal.inc({ status: 'success' });
            successResponse<TwoFactorBackupCodesRegenerated>(
                response,
                data,
                200,
                t('account.two-factor.backup-codes-regenerated')
            );
        })
        .catch((error: CastError | Error) =>
            rejectDatabaseError(response, 'post2faBackupCodes', error)
        );
};
