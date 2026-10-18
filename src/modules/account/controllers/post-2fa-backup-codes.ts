/**
 * @module
 * `POST /account/2fa/backup-codes` controller — thin HTTP adapter over
 * `twoFactorService.regenerateBackupCodes`.
 */

import type { Request, Response } from 'express';
import { RegenerateBackupCodesBody } from '@api/schemas.zod';
import type { TwoFactorBackupCodesRegenerated, TwoFactorCodeRequest } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { parseBody, refused, catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { twoFactorService } from '../services';
import { authTwoFactorBackupCodesRegenerateTotal } from '../metrics';

/**
 * POST /account/2fa/backup-codes — mints a fresh set of ten backup codes, discarding the old
 * ones. Fresh critical auth AND a valid code, same reasoning `delete2fa` gives.
 */
export const post2faBackupCodes = (
    request: Request<unknown, unknown, TwoFactorCodeRequest>,
    response: Response
) => {
    const { id } = request.authContext!;

    const body = parseBody(RegenerateBackupCodesBody, request.body, response);
    if (!body) {
        authTwoFactorBackupCodesRegenerateTotal.inc({ status: 'failure' });
        return;
    }

    return twoFactorService
        .regenerateBackupCodes(id, body.code, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) {
                authTwoFactorBackupCodesRegenerateTotal.inc({ status: 'failure' });
                return;
            }

            authTwoFactorBackupCodesRegenerateTotal.inc({ status: 'success' });
            successResponse<TwoFactorBackupCodesRegenerated>(
                response,
                result.data,
                200,
                t('account.two-factor.backup-codes-regenerated')
            );
        })
        .catch(catchAs(response, 'post2faBackupCodes'));
};
