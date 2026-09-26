/**
 * @module
 * `DELETE /account/pending-email` controller — thin HTTP adapter over
 * `accountService.cancelPendingEmailChange`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { refused, catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { accountService } from '../services';

/**
 * DELETE /account/pending-email — the explicit action that cancels a pending email change.
 * Resending the current address on `PUT`/`PATCH /account` no longer does — see
 * docs/modules/account.md#proving-an-address.
 */
export const cancelPendingEmail = (request: Request, response: Response) => {
    const { id } = request.authContext!;

    return accountService
        .cancelPendingEmailChange(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<undefined>(
                response,
                undefined,
                200,
                t('account.email-change.cancelled')
            );
        })
        .catch(catchAs(response, 'cancelPendingEmail'));
};
